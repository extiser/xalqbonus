import { defineEventHandler, getRouterParam } from 'h3';

import { dismissUnfinished } from '#server/services/candidates/dismissUnfinished';
import { readDraftIdParam, rejectApplicationFailure } from '#server/utils/applicationFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { APPLICATION_ROLES } from '#shared/access';
import type { UnfinishedDismissResponse } from '#shared/types/applications';

// «Убрать из списка» у человека из «Не закончили» (issue #475) — любой сотрудник раздела, без тела.
export default defineEventHandler(async (event): Promise<UnfinishedDismissResponse> => {
  const employee = await requireEmployeeRole(event, APPLICATION_ROLES);
  const draftId = readDraftIdParam(getRouterParam(event, 'id'));

  try {
    return await dismissUnfinished({ draftId, employeeId: employee.employeeId });
  } catch (error) {
    throw rejectApplicationFailure(error);
  }
});
