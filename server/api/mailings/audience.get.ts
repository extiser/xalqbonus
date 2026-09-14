import { readActiveWithinDays } from '#server/services/mailings/fields';
import { readMailingAudience } from '#server/services/mailings/readMailingAudience';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowMailingFailure } from '#server/utils/mailingFailure';
import { MAILING_ROLES } from '#shared/access';
import type { MailingAudienceResponse } from '#shared/types/mailing';

// Сколько адресатов у фильтра прямо сейчас: `?activeWithinDays=N`, пусто — все участники.
// Нужно форме до сохранения черновика, поэтому ручка про фильтр, а не про рассылку.
export default defineEventHandler(async (event): Promise<MailingAudienceResponse> => {
  await requireEmployeeRole(event, MAILING_ROLES);

  try {
    return await readMailingAudience(readActiveWithinDays(getQuery(event).activeWithinDays));
  } catch (error) {
    return rethrowMailingFailure(error);
  }
});
