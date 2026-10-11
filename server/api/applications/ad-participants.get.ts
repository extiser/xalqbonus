import { defineEventHandler, getQuery } from 'h3';

import { listAdParticipants } from '#server/services/candidates/listAdParticipants';
import { readOffsetParam } from '#server/utils/applicationFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { APPLICATION_ROLES } from '#shared/access';
import type { AdParticipantList } from '#shared/types/applications';

// Таблица «Участники программы, пришли по рекламе» раздела «Заявки» (issue #471).
export default defineEventHandler(async (event): Promise<AdParticipantList> => {
  await requireEmployeeRole(event, APPLICATION_ROLES);

  return listAdParticipants(readOffsetParam(getQuery(event).offset));
});
