import { Queue, UnrecoverableError, Worker } from 'bullmq';
import { consola } from 'consola';
import { TelegramSendError } from '#server/adapters/telegram/outgoing';
import type { Notification } from '#server/bot/notifications';
import { getQueueConnection } from '#server/queues/connection';
import {
  sendNotification,
  type NotificationOutcome,
} from '#server/services/notifications/sendNotification';

/**
 * Очередь уведомлений.
 *
 * **Отдельная от синхронизации, и общей с ней быть не может.** Очередь `sync` идёт строго
 * по одному прогону из-за узкой квоты Fleet API, а полный обход реестра занимает около
 * получаса: уведомление, вставшее за ним в одну очередь, приехало бы к водителю через
 * полчаса после начисления.
 *
 * В задании — человек, имя шаблона и его параметры, без готового текста: текст собирается
 * при отправке, по языку получателя, прочитанному тогда же (server/bot/notifications.ts).
 *
 * Второго экземпляра бота здесь нет и не будет: воркер шлёт исходящие вызовы клиентом
 * `Api` на том же токене, `bot.start()` и `setWebhook` не зовёт ниоткуда
 * (server/adapters/telegram/outgoing.ts).
 */

const log = consola.withTag('queue:notifications');

export const NOTIFICATIONS_QUEUE_NAME = 'notifications';

/**
 * Ограничение скорости очереди.
 *
 * Telegram отбивает и суммарный поток (около 30 сообщений в секунду), и частые сообщения
 * в один чат. Взято с запасом: впереди раздачи на тысячи человек, а выигрыш от отправки
 * на предельной скорости — ничто рядом с отказами по лимиту, которые придётся разгребать
 * повторами. Фактический потолок всё равно ставит Telegram, и его `retry_after`
 * очередь слушает отдельно.
 */
const RATE_LIMIT = { max: 20, duration: 1_000 };

/**
 * Сколько заданий идёт разом. Отправка — это ожидание ответа Telegram и ничего больше,
 * поэтому одно задание за раз упёрлось бы в задержку сети задолго до лимита скорости.
 */
const CONCURRENCY = 5;

export type NotificationJobData = { personId: string } & Notification;

// Очередь одна на процесс и держится на globalThis — по той же причине, что соединение
// с Redis: горячая перезагрузка в dev перевычисляет модуль, а вторая очередь с тем же
// именем означала бы второй набор соединений на ровном месте.
const globalForQueue = globalThis as typeof globalThis & {
  notificationsQueue?: Queue<NotificationJobData>;
};

export const getNotificationsQueue = (): Queue<NotificationJobData> => {
  if (!globalForQueue.notificationsQueue) {
    globalForQueue.notificationsQueue = new Queue<NotificationJobData>(NOTIFICATIONS_QUEUE_NAME, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        // Повтор — про сеть и сбой Telegram, а не про содержание уведомления: отказ,
        // который повтором не чинится, снимается с задания сразу (`UnrecoverableError`
        // в обработчике), и попытки на него не тратятся. Отказ по лимиту попытками
        // не считается вовсе: задание возвращается в очередь целиком.
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 1_000 },
      },
    });
  }

  return globalForQueue.notificationsQueue;
};

/**
 * Ставит уведомление в очередь.
 *
 * Задание одно на человека и повод. Ключа идемпотентности у него нет намеренно: повода
 * поставить одно и то же задание дважды не возникает — постановка идёт из операции,
 * которая сама защищена ключом (`awardWelcomeBonus`), — а очередь, отказывающая
 * по совпадению идентификатора, молча съела бы второе уведомление с тем же шаблоном
 * через месяц.
 */
export const enqueueNotification = async (job: NotificationJobData): Promise<void> => {
  await getNotificationsQueue().add(job.template, job);
};

/**
 * Отказ Telegram — в поведение очереди.
 *
 * Три вида, три разных ответа:
 *
 * - `rate_limit` — очередь встаёт ровно на то время, которое назвал Telegram, и задание
 *   возвращается в ожидание. Свой бэкофф здесь неуместен: у Telegram уже есть ответ на
 *   вопрос «когда», и гадать поверх него значит либо ждать лишнее, либо получить второй
 *   отказ. Попытка при этом не тратится — `Worker.RateLimitError` не считается провалом
 * - `rejected` — повторять бессмысленно: запрос неверен сам по себе, и через десять минут
 *   он будет неверен так же
 * - `transient` — сеть или сбой на стороне Telegram: повтор с бэкоффом
 */
const handleSendFailure = async (
  queue: Queue<NotificationJobData>,
  error: TelegramSendError,
): Promise<never> => {
  if (error.kind === 'rate_limit') {
    await queue.rateLimit(error.retryAfterMs ?? 1_000);

    throw Worker.RateLimitError();
  }

  if (error.kind === 'rejected') {
    throw new UnrecoverableError(error.message);
  }

  throw error;
};

/**
 * Воркер отправки. Очередь передаётся ему же: остановка по `retry_after` ставится
 * на очередь целиком, а не на одно задание — лимит Telegram общий для всех получателей.
 */
export const createNotificationsWorker = (
  queue: Queue<NotificationJobData> = getNotificationsQueue(),
): Worker<NotificationJobData, NotificationOutcome> =>
  // Исход задания — возвращаемое значение обработчика, и тип у него свой: без него
  // BullMQ считает результат `any`, а `any` в этом проекте запрещён.
  new Worker<NotificationJobData, NotificationOutcome>(
    NOTIFICATIONS_QUEUE_NAME,
    async (job) => {
      try {
        return await sendNotification(job.data);
      } catch (error) {
        if (error instanceof TelegramSendError) {
          return await handleSendFailure(queue, error);
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
export const closeNotificationsQueue = async (): Promise<void> => {
  if (!globalForQueue.notificationsQueue) {
    return;
  }

  await globalForQueue.notificationsQueue.close();
  globalForQueue.notificationsQueue = undefined;

  log.info('очередь уведомлений закрыта');
};
