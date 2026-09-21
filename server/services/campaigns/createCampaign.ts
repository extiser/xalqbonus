import { consola } from 'consola';
import { db } from '#server/db';
import { insertCampaignHalf, insertDraftCampaign } from '#server/repositories/campaigns';
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
 */
const log = consola.withTag('campaigns:create');

export const createCampaign = async (
  fields: CampaignFields,
  createdById: string,
): Promise<CampaignResponse> => {
  await checkCampaignSegment(fields.segmentId, null);

  const campaignId = await db
    .$transaction(async (transaction) => {
      const id = await insertDraftCampaign({ ...fields, createdById }, transaction);

      await insertCampaignHalf(
        id,
        'a',
        { startsOn: fields.startsOn, endsOn: fields.endsOn },
        transaction,
      );

      return id;
    })
    .catch((error: unknown) => rethrowSlugConflict(error, fields.slug));

  log.info('черновик акции заведён', { campaignId, createdById });

  return readCampaign(campaignId);
};
