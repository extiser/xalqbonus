import { defineEventHandler, getRouterParam, readBody } from 'h3';

import { readCandidateReply, replyFromAdmin } from '#server/services/candidates/replyFromAdmin';
import { denyApplication, readApplicationIdParam, rejectApplicationFailure } from '#server/utils/applicationFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { CANDIDATE_REPLY_ROLES } from '#shared/access';
import type { ApplicationReplyResponse } from '#shared/types/applications';

// Ответ кандидату из админки (issue #471) — владельцу и админу; менеджеры отвечают из темы.
export default defineEventHandler(async (event): Promise<ApplicationReplyResponse> => {
  const employee = await requireEmployeeRole(event, CANDIDATE_REPLY_ROLES);
  const applicationId = readApplicationIdParam(getRouterParam(event, 'id'));
  const body = await readBody<{ text?: unknown } | null>(event);
  const text = readCandidateReply(body?.text);

  if (text === null) {
    throw denyApplication('message_invalid');
  }

  try {
    return await replyFromAdmin({
      applicationId,
      employeeId: employee.employeeId,
      employeeName: employee.fullName,
      text,
    });
  } catch (error) {
    throw rejectApplicationFailure(error);
  }
});
