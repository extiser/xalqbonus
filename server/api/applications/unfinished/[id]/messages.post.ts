import { defineEventHandler, getRouterParam, readBody } from 'h3';

import { readCandidateReply } from '#server/services/candidates/replyFromAdmin';
import { replyToDraft } from '#server/services/candidates/replyToDraft';
import { denyApplication, readDraftIdParam, rejectApplicationFailure } from '#server/utils/applicationFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { CANDIDATE_REPLY_ROLES } from '#shared/access';
import type { UnfinishedReplyResponse } from '#shared/types/applications';

// Ответ человеку из «Не закончили» (issue #475) — владельцу и админу: темы в группе у него нет,
// и ответить ему можно только из админки.
export default defineEventHandler(async (event): Promise<UnfinishedReplyResponse> => {
  const employee = await requireEmployeeRole(event, CANDIDATE_REPLY_ROLES);
  const draftId = readDraftIdParam(getRouterParam(event, 'id'));
  const body = await readBody<{ text?: unknown } | null>(event);
  const text = readCandidateReply(body?.text);

  if (text === null) {
    throw denyApplication('message_invalid');
  }

  try {
    return await replyToDraft({ draftId, employeeId: employee.employeeId, text });
  } catch (error) {
    throw rejectApplicationFailure(error);
  }
});
