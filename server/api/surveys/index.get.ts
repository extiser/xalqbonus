import { readSurveyList } from '#server/services/surveys/readSurvey';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { MAILING_ROLES } from '#shared/access';
import type { SurveyListResponse } from '#shared/types/survey';

// Список опросов. Опросы живут в разделе рассылок и открыты тем же ролям (issue #320):
// менеджер получает отказ двери `role_not_allowed`.
export default defineEventHandler(async (event): Promise<SurveyListResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  return { surveys: await readSurveyList() };
});
