import { BotUnavailableError } from '#server/services/employees/botUnavailableError';
import { issueTelegramLink } from '#server/services/employees/telegramLink';
import { requireEmployee } from '#server/utils/employeeAuth';
import type { EmployeeTelegramLinkResponse } from '#shared/types/employee';

// Новая ссылка привязки Telegram — себе, из веба (issue #267). Живая прежняя отзывается:
// рабочая — та, что показана последней.
export default defineEventHandler(async (event): Promise<EmployeeTelegramLinkResponse> => {
  const employee = await requireEmployee(event);

  try {
    const result = await issueTelegramLink(employee.employeeId);

    // Telegram привязали, пока страница была открыта, — отвечаем состоянием, а не отказом:
    // страница покажет «Telegram привязан», и это ровно то, что человек хотел.
    if (result.outcome === 'already_bound') {
      return { bound: true, link: null };
    }

    return { bound: false, link: { link: result.url, expiresAt: result.expiresAt.toISOString() } };
  } catch (error) {
    // Бота нет — вести ссылке некуда. Это состояние машины, а не ошибка сотрудника,
    // поэтому 503, а не 400: выпуск заработает, как только появится токен.
    if (error instanceof BotUnavailableError) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Service Unavailable',
        message: 'Бот не настроен: ссылку на него выписывать не на кого.',
      });
    }

    throw error;
  }
});
