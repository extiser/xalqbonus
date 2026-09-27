import { readDemoOverview } from '#server/services/demo/readDemoOverview';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoOverviewResponse } from '#shared/types/demo';

// Раздел «Демо» (issue #252) одним ответом: страница перечитывает его после каждого действия.
// Только владельцу; демо-сотруднику закрыто и так — `allowDemo` не ставится.
export default defineEventHandler(async (event): Promise<DemoOverviewResponse> => {
  await requireEmployeeRole(event, DEMO_EDITOR_ROLES);

  return readDemoOverview();
});
