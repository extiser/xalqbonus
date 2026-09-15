import { Queue, Worker } from 'bullmq';
import { consola } from 'consola';
import { TelegramSendError } from '#server/adapters/telegram/outgoing';
import { getQueueConnection } from '#server/queues/connection';
import {
  deliverMailingMessage,
  type MailingDeliveryOutcome,
} from '#server/services/mailings/deliverMailingMessage';

/**
 * Очередь рассылок.
 *
 * **Своя, а не очередь уведомлений.** Рассылка на четыре тысячи человек, вставшая в одну
 * очередь с уведомлением о начислении, задержала бы уведомление на минуты: водитель доехал
 * пятую поездку, а сообщение о бонусе приходит после всей рассылки. Разные очереди — разные
 * воркеры, и уведомление рассылку не ждёт вовсе (server/queues/notifications.ts).
 *
 * Задание — один адресат, `jobId` — пара «рассылка + человек». Текста в задании нет:
 * он читается из рассылки при отправке, на языке получателя, прочитанном тогда же.
 */

const log = consola.withTag('queue:mailing');

export const MAILING_QUEUE_NAME = 'mailing';

/**
 * Скорость ниже, чем у уведомлений, и вместе с ними не выше потолка Telegram.
 *
 * Лимит Telegram — около 30 сообщений в секунду на бота, общий на обе очереди. Уведомлениям
 * отдано 20, рассылке — 8: четыре тысячи адресатов за восемь с половиной минут, и два
 * сообщения в секунду запаса на то, что уведомления и рассылка совпадут по времени.
 * `retry_after` от Telegram очередь при этом слушает отдельно.
 */
const RATE_LIMIT = { max: 8, duration: 1_000 };

/** Отправка — ожидание ответа Telegram, и одно задание за раз упёрлось бы в сеть раньше лимита. */
const CONCURRENCY = 4;

/** Попыток на адресата. Сбой сети и Telegram повторяется, отказ по содержанию — нет. */
const ATTEMPTS = 5;

/** Сколько заданий ставится и снимается за один заход в Redis. */
const CHUNK_SIZE = 500;

export type MailingJobData = { mailingId: string; personId: string };

/**
 * Идентификатор задания из пары «рассылка + человек». Через подчёркивание: двоеточие BullMQ
 * в своём идентификаторе запрещает, а дефис уже есть внутри uuid.
 */
const jobIdFor = (mailingId: string, personId: string): string => `${mailingId}_${personId}`;

// Очередь одна на процесс и держится на globalThis — по той же причине, что очередь
// уведомлений: горячая перезагрузка в dev перевычисляет модуль.
const globalForQueue = globalThis as typeof globalThis & {
  mailingQueue?: Queue<MailingJobData>;
};

export const getMailingQueue = (): Queue<MailingJobData> => {
  if (!globalForQueue.mailingQueue) {
    globalForQueue.mailingQueue = new Queue<MailingJobData>(MAILING_QUEUE_NAME, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        attempts: ATTEMPTS,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 1_000 },
      },
    });
  }

  return globalForQueue.mailingQueue;
};

/**
 * Ставит задания адресатам.
 *
 * Совпадение `jobId` с заданием, ещё лежащим в очереди, второго не заводит — повтор запуска
 * это и использует. Задание, уже убранное из очереди после выполнения, завестись заново
 * может, и защищает от второй отправки не очередь, а условие «ещё `pending`» при записи
 * исхода и проверка исхода перед отправкой.
 */
export const enqueueMailingRecipients = async (
  mailingId: string,
  personIds: readonly string[],
): Promise<void> => {
  const queue = getMailingQueue();

  for (let offset = 0; offset < personIds.length; offset += CHUNK_SIZE) {
    await queue.addBulk(
      personIds.slice(offset, offset + CHUNK_SIZE).map((personId) => ({
        name: 'deliver',
        data: { mailingId, personId },
        opts: { jobId: jobIdFor(mailingId, personId) },
      })),
    );
  }
};

/**
 * Снимает ждущие задания рассылки. Возвращает, сколько сняло.
 *
 * Задание в руках воркера снять нельзя — BullMQ отказывает по блокировке, — и это не отказ
 * остановки: такое задание прочитает статус и закроется без отправки.
 */
export const removeMailingJobs = async (
  mailingId: string,
  personIds: readonly string[],
): Promise<number> => {
  const queue = getMailingQueue();
  let removed = 0;

  for (let offset = 0; offset < personIds.length; offset += CHUNK_SIZE) {
    const results = await Promise.all(
      personIds
        .slice(offset, offset + CHUNK_SIZE)
        .map((personId) => queue.remove(jobIdFor(mailingId, personId)).catch(() => 0)),
    );

    removed += results.reduce((sum, result) => sum + result, 0);
  }

  return removed;
};

/**
 * Воркер отправки. Лимит Telegram ставит на паузу очередь целиком, как у уведомлений:
 * он общий для всех получателей. Отказы по содержанию и умерший канал разбирает сервис
 * и закрывает задание исходом — наверх доезжают только лимит и сбой сети.
 */
export const createMailingWorker = (
  queue: Queue<MailingJobData> = getMailingQueue(),
): Worker<MailingJobData, MailingDeliveryOutcome> =>
  new Worker<MailingJobData, MailingDeliveryOutcome>(
    MAILING_QUEUE_NAME,
    async (job) => {
      try {
        return await deliverMailingMessage({
          ...job.data,
          lastAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
        });
      } catch (error) {
        if (error instanceof TelegramSendError && error.kind === 'rate_limit') {
          await queue.rateLimit(error.retryAfterMs ?? 1_000);

          throw Worker.RateLimitError();
        }

        throw error;
      }
    },
    {
      connection: getQueueConnection(),
      concurrency: CONCURRENCY,
      limiter: RATE_LIMIT,
    },
  );

/** Закрывает очередь. Воркера не касается: его останавливают отдельно и первым. */
export const closeMailingQueue = async (): Promise<void> => {
  if (!globalForQueue.mailingQueue) {
    return;
  }

  await globalForQueue.mailingQueue.close();
  globalForQueue.mailingQueue = undefined;

  log.info('очередь рассылок закрыта');
};
