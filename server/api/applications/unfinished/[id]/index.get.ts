import { defineEventHandler, getRouterParam } from 'h3';

import { readUnfinishedCard } from '#server/services/candidates/readUnfinishedCard';
import { readDraftIdParam, rejectApplicationFailure } from '#server/utils/applicationFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { APPLICATION_ROLES } from '#shared/access';
import type { UnfinishedCardResponse } from '#shared/types/applications';

// Карточка человека из «Не закончили» (issue #475). Подал заявку — в ответе только её
// идентификатор: страница уходит в карточку заявки.
export default defineEventHandler(async (event): Promise<UnfinishedCardResponse> => {
  const employee = await requireEmployeeRole(event, APPLICATION_ROLES);
  const draftId = readDraftIdParam(getRouterParam(event, 'id'));

  try {
    return await readUnfinishedCard({ draftId, viewerRole: employee.role });
  } catch (error) {
    throw rejectApplicationFailure(error);
  }
});
