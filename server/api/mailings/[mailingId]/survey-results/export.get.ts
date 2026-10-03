import { exportMailingSurveyResults } from '#server/services/mailings/exportMailingSurveyResults';
import { readMailingSurveyResultsParams } from '#server/services/mailings/mailingSurveyScope';
import { buildCsv, sendCsvFile } from '#server/utils/csvDownload';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { requireUuidParam } from '#server/utils/query';
import { MAILING_ROLES } from '#shared/access';

// Итоги опроса у рассылки файлом CSV (issue #325): строка на человека из снимка, срез —
// колонкой. Переключатель «только прошедшие» файл не сужает: метки воронки в нём и так есть.
export default defineEventHandler(async (event): Promise<Buffer> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  const mailingId = requireUuidParam(event, 'mailingId');

  try {
    const { slice } = readMailingSurveyResultsParams(getQuery(event));
    const { fileName, rows } = await exportMailingSurveyResults(mailingId, slice);

    return sendCsvFile(event, buildCsv(rows), fileName);
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
