import { Queue, UnrecoverableError, Worker } from 'bullmq';
import { consola } from 'consola';
import { TelegramSendError } from '#server/adapters/telegram/outgoing';
import { getQueueConnection } from '#server/queues/connection';
import {
  openCandidateTopic,
  type OpenCandidateTopicInput,
  type OpenCandidateTopicOutcome,
} from '#server/services/candidates/openCandidateTopic';

/**
 * Очередь переписки с кандидатом (issue #463): тема в группе сотрудников, карточка заявки
 * и приветствие кандидату — то, что случается по событию заявки.
 *
 * **Своя, а не очередь уведомлений.** Адресат уведомления — человек программы, а у кандидата
 * его нет: выключатель уведомлений и окно отправки к нему не относятся (docs/decisions.md →
 * «Переписка с кандидатом»). Пересылка сообщений между кандидатом и темой сюда не идёт —
 * это ответ бота на входящее и живёт в обработчике апдейта.
 *
 * Задание одно на заявку: `jobId` из её идентификатора, и вторая постановка той же заявки
 * второго задания не заводит. Повтор после сбоя безопасен — шаг, который уже сделан,
 * сервис пропускает.
 */

const log = consola.withTag('queue:candidates');

export const CANDIDATES_QUEUE_NAME = 'candidates';

const OPEN_TOPIC_JOB = 'openCandidateTopic';

export type CandidateTopicJobData = OpenCandidateTopicInput;

/**
 * Идентификатор задания заявки. Через подчёркивание: двоеточие BullMQ в своём идентификаторе
 * запрещает (server/queues/mailing.ts).
 */
const jobIdFor = (applicationId: string): string => `topic_${applicationId}`;

// Очередь одна на процесс и держится на globalThis — по той же причине, что очередь
// уведомлений: горячая перезагрузка в dev перевычисляет модуль.
const globalForQueue = globalThis as typeof globalThis & {
  candidatesQueue?: Queue<CandidateTopicJobData>;
};

export const getCandidatesQueue = (): Queue<CandidateTopicJobData> => {
  if (!globalForQueue.candidatesQueue) {
    globalForQueue.candidatesQueue = new Queue<CandidateTopicJobData>(CANDIDATES_QUEUE_NAME, {
      connection: getQueueConnection(),
      // Повторы — как у уведомлений: сеть и сбой Telegram повторяются с паузой, отказ
      // по содержанию снимается сразу, лимит попыткой не считается.
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 1_000 },
      },
    });
  }

  return globalForQueue.candidatesQueue;
};

/** Ставит тему, карточку и приветствие по только что поданной заявке. */
export const enqueueCandidateTopic = async (data: CandidateTopicJobData): Promise<void> => {
  await getCandidatesQueue().add(OPEN_TOPIC_JOB, data, { jobId: jobIdFor(data.applicationId) });
};

/** Чем кончилась постановка задания для уже поданной заявки. */
export type CandidateTopicRequeueOutcome = 'queued' | 'already_queued';

/**
 * Ставит задание для заявки, поданной раньше (`make candidate-topic`): до того, как задана
 * группа, или для локальной проверки.
 *
 * Задание с тем же `jobId` BullMQ не ставит, пока прежнее хранится среди выполненных или упавших, —
 * такое прежнее убирается. Задание, ещё ждущее или идущее, не трогается: второе с ним разошлось бы.
 * Сделанные шаги сервис пропускает сам, поэтому повторный запуск безопасен.
 */
export const requeueCandidateTopic = async (data: CandidateTopicJobData): Promise<CandidateTopicRequeueOutcome> => {
  const queue = getCandidatesQueue();
  const jobId = jobIdFor(data.applicationId);
  const previous = await queue.getJob(jobId);

  if (previous) {
    const state = await previous.getState();

    if (state !== 'completed' && state !== 'failed') {
      return 'already_queued';
    }

    await previous.remove();
  }

  await queue.add(OPEN_TOPIC_JOB, data, { jobId });

  return 'queued';
};

/**
 * Воркер очереди. Лимит Telegram ставит на паузу очередь целиком; отказ, который повтор
 * не чинит, снимает задание со строкой ошибки.
 */
export const createCandidatesWorker = (
  queue: Queue<CandidateTopicJobData> = getCandidatesQueue(),
): Worker<CandidateTopicJobData, OpenCandidateTopicOutcome> =>
  new Worker<CandidateTopicJobData, OpenCandidateTopicOutcome>(
    CANDIDATES_QUEUE_NAME,
    async (job) => {
      try {
        return await openCandidateTopic(job.data);
      } catch (error) {
        if (error instanceof TelegramSendError && error.kind === 'rate_limit') {
          await queue.rateLimit(error.retryAfterMs ?? 1_000);

          throw Worker.RateLimitError();
        }

        if (error instanceof TelegramSendError && error.kind === 'rejected') {
          log.error('приветствие кандидату отклонено Telegram — задание снято', {
            applicationId: job.data.applicationId,
            error: error.message,
          });

          throw new UnrecoverableError(error.message);
        }

        throw error;
      }
    },
    { connection: getQueueConnection() },
  );

/** Закрывает очередь. Воркера не касается: его останавливают отдельно и первым. */
export const closeCandidatesQueue = async (): Promise<void> => {
  if (!globalForQueue.candidatesQueue) {
    return;
  }

  await globalForQueue.candidatesQueue.close();
  globalForQueue.candidatesQueue = undefined;

  log.info('очередь кандидатов закрыта');
};
