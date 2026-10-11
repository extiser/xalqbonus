import { defineEventHandler, getRouterParam } from 'h3';

import { readApplicationCard } from '#server/services/candidates/readApplicationCard';
import { readApplicationIdParam, rejectApplicationFailure } from '#server/utils/applicationFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { APPLICATION_ROLES } from '#shared/access';
import type { ApplicationCard } from '#shared/types/applications';

// Карточка заявки (issue #471). Заявку без сверки карточка ставит на пересверку в фоне.
export default defineEventHandler(async (event): Promise<ApplicationCard> => {
  const employee = await requireEmployeeRole(event, APPLICATION_ROLES);
  const applicationId = readApplicationIdParam(getRouterParam(event, 'id'));

  try {
    return await readApplicationCard({ applicationId, viewerRole: employee.role });
  } catch (error) {
    throw rejectApplicationFailure(error);
  }
});
