import { readTelegramCandidate } from '#server/services/drivers/readTelegramCandidate';
import { requireEmployee } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { explainTelegramLinkFailure, requireTelegramId } from '#server/utils/telegramLinkFailure';
import type { DriverTelegramCandidateResponse } from '#shared/types/driver';

// Проверка Telegram перед привязкой из карточки водителя (issue #305): ничего не пишет,
// отдаёт то, что покажет диалог подтверждения. Отказы — те же, что у привязки.
//
// Открыта всем ролям, менеджеру тоже: защита здесь — попытка привязки, а не роль.
export default defineEventHandler(async (event): Promise<DriverTelegramCandidateResponse> => {
  await requireEmployee(event);

  const personId = requireUuidParam(event, 'personId');
  const telegramUserId = requireTelegramId(getQuery(event).telegramId);

  try {
    return await readTelegramCandidate(personId, telegramUserId);
  } catch (error) {
    throw explainTelegramLinkFailure(error) ?? error;
  }
});
