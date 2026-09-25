import { enqueueNotification } from '#server/queues/notifications';

/**
 * Сброс сессии из профиля (issue #216, T53): бот присылает в чат приветствие с кнопкой
 * «Открыть приложение», как на /start.
 *
 * В базе не меняется ничего — привязка не закрывается, учётка та же. Закрытие отбилось бы
 * при повторном входе: `registerDriverByContact` не пускает пару «человек + чат», закрытую
 * в истории. Сброс живёт на стороне приложения — оно стирает свою копию `initData`
 * и закрывается, — а отсюда уходит только сообщение.
 *
 * Через очередь уведомлений, а не прямой отправкой: лимиты Telegram, повторы и умерший канал
 * там уже разобраны. Язык и чат читаются в момент отправки, как у любого уведомления.
 */
export const requestAppRelaunch = async (personId: string): Promise<void> => {
  await enqueueNotification({ personId, template: 'app_relaunch', params: {} });
};
