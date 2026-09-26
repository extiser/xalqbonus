import { consola } from 'consola';
import { db } from '#server/db';
import { insertCampaignHalf, insertDraftCampaign } from '#server/repositories/campaigns';
import { checkCampaignOffice } from '#server/services/campaigns/checkCampaignOffice';
import { checkCampaignSegment } from '#server/services/campaigns/checkCampaignSegment';
import type { CampaignFields } from '#server/services/campaigns/fields';
import { readCampaign } from '#server/services/campaigns/readCampaign';
import { rethrowSlugConflict } from '#server/services/campaigns/slugConflict';
import type { CampaignResponse } from '#shared/types/campaign';

/**
 * Заведение черновика.
 *
 * Заводит его форма первым действием (issue #148), поэтому поля могут быть пустыми все:
 * название, `slug`, сегмент и окно — условия запуска, а не заведения.
 *
 * Строка окна половины А ставится в той же транзакции: у каждой акции она есть с заведения,
 * и правка черновика пишет даты в неё, а не заводит по дороге.
 *
 * Признак демо ставится здесь и больше нигде (issue #212). Кто вправе его поставить, решила
 * ручка — `requireDemoEditor`; сегмент и офис обязаны быть того же мира.
 */
const log = consola.withTag('campaigns:create');

export const createCampaign = async (
  fields: CampaignFields,
  createdById: string,
  isDemo: boolean,
): Promise<CampaignResponse> => {
  await checkCampaignSegment(fields.segmentId, null, isDemo);
  await checkCampaignOffice(fields.officeId, null, isDemo);

  const campaignId = await db
    .$transaction(async (transaction) => {
      const id = await insertDraftCampaign({ ...fields, createdById, isDemo }, transaction);

      await insertCampaignHalf(
        id,
        'a',
        { startsOn: fields.startsOn, endsOn: fields.endsOn },
        transaction,
      );

      return id;
    })
    .catch((error: unknown) => rethrowSlugConflict(error, fields.slug));

  log.info('черновик акции заведён', { campaignId, createdById, isDemo });

  return readCampaign(campaignId);
};
