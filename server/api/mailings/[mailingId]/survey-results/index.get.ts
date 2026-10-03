import { readMailingSurveyResultsParams } from '#server/services/mailings/mailingSurveyScope';
import { readMailingSurveyResults } from '#server/services/mailings/readMailingSurveyResults';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { requireUuidParam } from '#server/utils/query';
import { MAILING_ROLES } from '#shared/access';
import type { MailingSurveyResultsResponse } from '#shared/types/surveyResults';

// Итоги опроса у рассылки (issue #325). Видят все, кто видит опрос, — тем же списком ролей.
// Выгрузка — `export.get.ts` рядом, тем же кругом и срезом.
export default defineEventHandler(async (event): Promise<MailingSurveyResultsResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  const mailingId = requireUuidParam(event, 'mailingId');

  try {
    const params = readMailingSurveyResultsParams(getQuery(event));

    return { results: await readMailingSurveyResults(mailingId, params) };
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
