import { BotUnavailableError } from '#server/services/employees/botUnavailableError';
import { issueTelegramLink } from '#server/services/employees/telegramLink';
import { requireEmployee } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import type { EmployeeTelegramLinkResponse } from '#shared/types/employee';

// Ссылка привязки Telegram к учётке (issue #267). Выпускает руководитель — из строки учётки
// в «Сотрудниках», по тому же праву, что сброс пароля, — и каждый себе: из своей строки и на шаге
// после принятия приглашения. Поэтому ручка открыта любой роли, а право решает сервис.
// Живая прежняя ссылка отзывается: рабочая — та, что выпущена последней.
export default defineEventHandler(async (event): Promise<EmployeeTelegramLinkResponse> => {
  const employee = await requireEmployee(event);
  const employeeId = requireUuidParam(event, 'employeeId');

  try {
    const result = await issueTelegramLink({
      actor: { employeeId: employee.employeeId, role: employee.role },
      employeeId,
    });

    if (result.outcome === 'not_found') {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: 'учётки с таким идентификатором нет',
      });
    }

    if (result.outcome === 'forbidden') {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        message: 'ссылку привязки можно выпустить себе или учётке роли ниже своей',
      });
    }

    if (result.outcome === 'demo_account') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: 'у демо-учётки своего Telegram не бывает',
      });
    }

    // Telegram привязали, пока страница была открыта, — отвечаем состоянием, а не отказом:
    // строка покажет «Telegram привязан», и это ровно то, чего добивались.
    if (result.outcome === 'bound') {
      return { bound: true, link: null };
    }

    return { bound: false, link: { link: result.url, expiresAt: result.expiresAt.toISOString() } };
  } catch (error) {
    // Бота нет — вести ссылке некуда. Это состояние машины, а не ошибка сотрудника,
    // поэтому 503, а не 400: выпуск заработает, как только появится токен. Страница
    // приглашения по нему пропускает шаг привязки.
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
