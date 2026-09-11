import { closeQueueConnection } from '#server/queues/connection';
import { closeNotificationsQueue } from '#server/queues/notifications';

/**
 * Закрывает очередь и соединение с Redis после тестов, которые её тронули.
 *
 * Тронули её тесты начисления: приветственный бонус ставит уведомление в очередь, и вызов
 * этот настоящий — заглушки в ядре баллов не ставятся принципиально (docs/infra.md →
 * «Тесты»). Незакрытое соединение держит цикл событий живым, и прогон не завершается сам.
 */
export const disconnectQueues = async (): Promise<void> => {
  await closeNotificationsQueue();
  await closeQueueConnection();
};
