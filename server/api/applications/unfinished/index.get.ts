import { defineEventHandler, getQuery } from 'h3';

import { listUnfinished } from '#server/services/candidates/listUnfinished';
import { readOffsetParam } from '#server/utils/applicationFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { APPLICATION_ROLES } from '#shared/access';
import type { UnfinishedList } from '#shared/types/applications';

// Вкладка «Не закончили» (issue #475): люди, нажавшие `/start` по метке и не подавшие заявку, —
// страница строк под поиском. Плитки и число у пилюли отдаёт список заявок.
export default defineEventHandler(async (event): Promise<UnfinishedList> => {
  await requireEmployeeRole(event, APPLICATION_ROLES);

  const query = getQuery(event);

  return listUnfinished({
    query: typeof query.q === 'string' ? query.q : '',
    offset: readOffsetParam(query.offset),
  });
});
