import { dismissDraft } from '#server/repositories/candidateChatDrafts';
import { ApplicationDenialError } from '#server/services/candidates/applicationDenial';
import type { UnfinishedDismissResponse } from '#shared/types/applications';

/**
 * «Убрать из списка» у человека из «Не закончили» (issue #475): без подтверждения — убрать
 * не значит удалить, сообщения остаются, карточка открывается по прямой ссылке. Новый `/start`
 * и любое сообщение человека в черновик возвращают его в список (docs/decisions.md →
 * «„Не закончили“ в заявках»). Уже убранный — без изменений.
 */
export const dismissUnfinished = async (input: {
  draftId: string;
  employeeId: string;
}): Promise<UnfinishedDismissResponse> => {
  const outcome = await dismissDraft(input.draftId, input.employeeId);

  if (outcome === 'not_found') {
    throw new ApplicationDenialError('draft_not_found');
  }

  if (outcome === 'closed') {
    throw new ApplicationDenialError('draft_closed');
  }

  return { dismissed: true };
};
