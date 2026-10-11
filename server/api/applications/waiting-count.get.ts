import { defineEventHandler } from 'h3';

import { countWaitingApplications } from '#server/services/candidates/countWaitingApplications';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { APPLICATION_ROLES } from '#shared/access';
import type { ApplicationWaitingCount } from '#shared/types/applications';

// Сколько заявок ждёт ответа — счётчик у пункта меню «Заявки» (issue #471).
export default defineEventHandler(async (event): Promise<ApplicationWaitingCount> => {
  await requireEmployeeRole(event, APPLICATION_ROLES);

  return countWaitingApplications();
});
