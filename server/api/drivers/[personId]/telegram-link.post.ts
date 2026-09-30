import { relinkTelegram } from '#server/services/drivers/relinkTelegram';
import { requireEmployee } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { explainTelegramLinkFailure, requireTelegramId } from '#server/utils/telegramLinkFailure';

// Привязка Telegram из карточки водителя (issue #305): действующая привязка, если есть,
// закрывается, новая открывается по попытке, которую выбрал введённый ID.
//
// Открыта всем ролям, менеджеру тоже: защита здесь — попытка привязки, а не роль.
type TelegramLinkBody = { telegramId?: unknown };

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const employee = await requireEmployee(event);

  const personId = requireUuidParam(event, 'personId');
  const body = await readBody<TelegramLinkBody>(event);
  const telegramUserId = requireTelegramId(body?.telegramId);

  try {
    await relinkTelegram({ actorEmployeeId: employee.employeeId, personId, telegramUserId });
  } catch (error) {
    throw explainTelegramLinkFailure(error) ?? error;
  }

  return { ok: true };
});
