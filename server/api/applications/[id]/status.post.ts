import { defineEventHandler, getRouterParam, readBody } from 'h3';

import { markApplicationStatus } from '#server/services/candidates/markApplicationStatus';
import { denyApplication, readApplicationIdParam, rejectApplicationFailure } from '#server/utils/applicationFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { APPLICATION_ROLES } from '#shared/access';
import { isApplicationMarkStatus } from '#shared/candidateApplications';
import type { ApplicationStatusResponse } from '#shared/types/applications';

// Отметка в заявке (issue #471): «Оформлен», «Отказ» и «Вернуть в работу» — любой сотрудник
// раздела. Поля тела, кроме `status`, не читаются.
export default defineEventHandler(async (event): Promise<ApplicationStatusResponse> => {
  const employee = await requireEmployeeRole(event, APPLICATION_ROLES);
  const applicationId = readApplicationIdParam(getRouterParam(event, 'id'));
  const body = await readBody<{ status?: unknown } | null>(event);
  const status = body?.status;

  if (!isApplicationMarkStatus(status)) {
    throw denyApplication('status_invalid');
  }

  try {
    return await markApplicationStatus({ applicationId, status, employeeId: employee.employeeId });
  } catch (error) {
    throw rejectApplicationFailure(error);
  }
});
