import { findOffice } from '#server/repositories/offices';
import { CampaignOfficeDemoMismatchError } from '#server/services/campaigns/errors';

/**
 * Годится ли офис выдачи для акции по признаку демо (issue #212): у демо-акции — ДЕМО ОФИС,
 * у живой — живой. Живой водитель ДЕМО ОФИС не видит, и приз, лежащий там, он бы не забрал.
 *
 * Как у сегмента, проверяется только новый выбор: признак не меняется ни у офиса, ни у акции,
 * а запуск проверяет офис ещё раз. Офиса нет — не здесь: несуществующий идентификатор
 * не пропустит внешний ключ.
 */
export const checkCampaignOffice = async (
  officeId: string | null,
  previousOfficeId: string | null,
  campaignIsDemo: boolean,
): Promise<void> => {
  if (officeId === null || officeId === previousOfficeId) {
    return;
  }

  const office = await findOffice(officeId);

  if (office && office.isDemo !== campaignIsDemo) {
    throw new CampaignOfficeDemoMismatchError(officeId, campaignIsDemo);
  }
};
