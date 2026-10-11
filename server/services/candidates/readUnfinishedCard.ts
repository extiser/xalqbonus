import type { EmployeeRole } from '#server/generated/prisma/enums';
import {
  type DraftMessageRow,
  findDraftCard,
  findDraftWaitingSince,
  findPromoLinkNames,
  listDraftMessages,
} from '#server/repositories/candidateChatDrafts';
import { ApplicationDenialError } from '#server/services/candidates/applicationDenial';
import { CANDIDATE_REPLY_ROLES } from '#shared/access';
import { formatPhone } from '#shared/phone';
import type { DraftMessage, UnfinishedCardResponse } from '#shared/types/applications';

/**
 * Карточка человека из «Не закончили» (issue #475): Telegram, переписка из черновика, откуда
 * пришёл и ход заявки. Открывается и у убранного из списка — по прямой ссылке. Черновик, которым
 * кончилась заявка, отвечает её идентификатором: страница уходит в карточку заявки.
 */

/** Сообщение черновика для экрана; `phoneMessageId` — контакт, по которому черновик взял номер. */
export const toDraftMessage = (message: DraftMessageRow, phoneMessageId: string | null): DraftMessage => ({
  id: message.id,
  author: message.author,
  authorName: message.author === 'employee' ? (message.employee?.fullName ?? null) : null,
  kind: message.kind,
  text: message.text,
  delivery: message.delivery,
  failure: message.failure,
  createdAt: message.createdAt.toISOString(),
  isPhoneMessage: message.id === phoneMessageId,
});

export const readUnfinishedCard = async (input: {
  draftId: string;
  viewerRole: EmployeeRole;
}): Promise<UnfinishedCardResponse> => {
  const draft = await findDraftCard(input.draftId);

  if (!draft) {
    throw new ApplicationDenialError('draft_not_found');
  }

  if (draft.applicationId !== null) {
    return { applicationId: draft.applicationId };
  }

  const [waitingSince, messages, promoNames] = await Promise.all([
    findDraftWaitingSince(draft.id),
    listDraftMessages(draft.id),
    findPromoLinkNames([draft.promoCode]),
  ]);

  return {
    draft: {
      id: draft.id,
      telegramName: draft.telegramName,
      telegramUsername: draft.telegramUsername,
      telegramUserId: draft.telegramUserId.toString(),
      step: draft.step,
      phone: draft.phoneE164 === null ? null : formatPhone(draft.phoneE164).display,
      promoCode: draft.promoCode,
      promoName: promoNames.get(draft.promoCode) ?? null,
      startedAt: draft.startedAt.toISOString(),
      phoneAt: draft.phoneMessage?.createdAt.toISOString() ?? null,
      handledBy: draft.handledByEmployee?.fullName ?? null,
      waitingSince: waitingSince?.toISOString() ?? null,
      dismissed: draft.dismissedAt !== null,
    },
    messages: messages.map((message) => toDraftMessage(message, draft.phoneMessageId)),
    canReply: CANDIDATE_REPLY_ROLES.includes(input.viewerRole),
  };
};
