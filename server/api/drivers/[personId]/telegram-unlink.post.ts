import { unlinkTelegram } from '#server/services/drivers/unlinkTelegram';
import { requireEmployee } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { explainTelegramLinkFailure } from '#server/utils/telegramLinkFailure';

// Отвязка Telegram из карточки водителя (issue #305): действующая привязка закрывается без
// новой. Участие, счёт и баланс остаются.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const employee = await requireEmployee(event);

  const personId = requireUuidParam(event, 'personId');

  try {
    await unlinkTelegram({ actorEmployeeId: employee.employeeId, personId });
  } catch (error) {
    throw explainTelegramLinkFailure(error) ?? error;
  }

  return { ok: true };
});
