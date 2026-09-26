import { readMailingAudience } from '#server/services/mailings/readMailingAudience';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { MAILING_ROLES } from '#shared/access';
import type { MailingAudienceResponse } from '#shared/types/mailing';

// Сколько адресатов у рассылки прямо сейчас. Про аудиторию, а не про рассылку: фильтров нет,
// и число одно на все черновики — форме оно нужно ещё до сохранения. Своё число только
// у демо-рассылки — `?demo=true` (issue #212): её аудитория — одни демо-водители.
export default defineEventHandler(async (event): Promise<MailingAudienceResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  return readMailingAudience(getQuery(event).demo === 'true');
});
