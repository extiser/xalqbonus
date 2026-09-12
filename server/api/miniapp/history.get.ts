import { readLinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { readMemberHistory } from '#server/services/drivers/readMemberHistory';
import { requireTelegramUser } from '#server/utils/telegramAuth';
import type { MiniAppHistoryResponse } from '#shared/types/miniapp';

/**
 * История операций того, кто открыл приложение.
 *
 * **Идентификатора человека в запросе нет и быть не может.** Он пришёл бы от клиента,
 * а клиенту мы не верим ни в чём, кроме подписи: адрес с чужим `personId` отдал бы
 * историю чужого счёта любому, кто умеет править строку в консоли браузера
 * (docs/miniapp.md → «Личность приходит от мессенджера»). Чей это счёт, решает
 * проверенная `initData` и привязка в базе — ровно как в `me`.
 *
 * Своей ручкой, а не `/api/drivers/{personId}/history`: та собирает разбор для сотрудника
 * и несёт вторую сторону перевода с именем, автора правки и номера заказов.
 */
export default defineEventHandler(async (event): Promise<MiniAppHistoryResponse> => {
  const user = requireTelegramUser(event);
  const driver = await readLinkedDriver(user.id);

  // Подпись годная, а участия нет: у этого человека нет ни счёта, ни истории, и отвечать
  // ему пустой страницей значило бы сказать «операций нет» там, где верно «вы не в
  // программе». Экран регистрации эту ручку не зовёт вовсе.
  if (!driver) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'в программе не состоит',
    });
  }

  const cursor = getQuery(event).cursor;

  // Размера страницы в запросе нет: выбирать его водителю нечем, а параметр, который
  // никто не задаёт, — это способ попросить у ручки весь журнал разом.
  return readMemberHistory({
    personId: driver.personId,
    // Язык участника, а не `language_code` из Telegram: он однажды его выбрал, и история
    // обязана говорить на том же языке, что и остальной экран.
    language: driver.language,
    cursor: typeof cursor === 'string' ? cursor : '',
  });
});
