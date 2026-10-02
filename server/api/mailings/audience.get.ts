import { InvalidMailingFieldsError } from '#server/services/mailings/errors';
import { readMailingAudience } from '#server/services/mailings/readMailingAudience';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { readUuid } from '#server/utils/query';
import { MAILING_ROLES } from '#shared/access';
import type { MailingAudienceResponse } from '#shared/types/mailing';

// Сколько адресатов у рассылки прямо сейчас. Про аудиторию, а не про рассылку: форме число
// нужно ещё до сохранения. Своё число у демо-рассылки — `?demo=true` (issue #212): её
// аудитория — одни демо-водители. Сегмент — `?segmentId=<uuid>` (issue #321): адресаты
// режутся его составом; нет параметра — все участники.
export default defineEventHandler(async (event): Promise<MailingAudienceResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  const query = getQuery(event);

  try {
    const segmentText = typeof query.segmentId === 'string' ? query.segmentId : '';
    const segmentId = segmentText === '' ? null : readUuid(segmentText);

    if (segmentText !== '' && segmentId === null) {
      throw new InvalidMailingFieldsError('segment_invalid');
    }

    return await readMailingAudience(query.demo === 'true', segmentId);
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
