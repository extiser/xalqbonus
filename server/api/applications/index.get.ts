// Ручки раздела берут функции `h3` явно, а не автоимпортом: тест доступа зовёт их напрямую,
// а в тесте автоимпортов Nitro нет (issue #471).
import { defineEventHandler, getQuery } from 'h3';

import { listApplications } from '#server/services/candidates/listApplications';
import { readOffsetParam } from '#server/utils/applicationFailure';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { APPLICATION_ROLES } from '#shared/access';
import { isApplicationFilter } from '#shared/candidateApplications';
import type { ApplicationList } from '#shared/types/applications';

// Список заявок кандидатов (issue #471): плитки, число у каждой пилюли и страница строк
// под фильтром и поиском. Негодный фильтр — «Все»: адрес, поправленный руками, не отказ.
export default defineEventHandler(async (event): Promise<ApplicationList> => {
  await requireEmployeeRole(event, APPLICATION_ROLES);

  const query = getQuery(event);

  return listApplications({
    filter: isApplicationFilter(query.filter) ? query.filter : 'all',
    query: typeof query.q === 'string' ? query.q : '',
    offset: readOffsetParam(query.offset),
  });
});
