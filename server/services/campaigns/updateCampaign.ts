import { db } from '#server/db';
import {
  findCampaign,
  updateDraftCampaign,
  updateDraftCampaignFirstHalf,
} from '#server/repositories/campaigns';
import { checkCampaignOffice } from '#server/services/campaigns/checkCampaignOffice';
import { checkCampaignSegment } from '#server/services/campaigns/checkCampaignSegment';
import {
  CampaignStatusMismatchError,
  UnknownCampaignError,
} from '#server/services/campaigns/errors';
import type { CampaignFields } from '#server/services/campaigns/fields';
import { readCampaign } from '#server/services/campaigns/readCampaign';
import { rethrowSlugConflict } from '#server/services/campaigns/slugConflict';
import type { CampaignResponse } from '#shared/types/campaign';

/**
 * Правка черновика: название, `slug`, сегмент, окно половины А и переключатель деления.
 *
 * Запущенная акция не правится ничем: состав снят по сегменту и делению, окно уже идёт,
 * а `slug` стал частью ключей идемпотентности. Условие «ещё черновик» стоит в самих `UPDATE`:
 * между чтением и записью акцию мог запустить второй сотрудник.
 */
export const updateCampaign = async (
  campaignId: string,
  fields: CampaignFields,
): Promise<CampaignResponse> => {
  const current = await findCampaign(campaignId);

  if (!current) {
    throw new UnknownCampaignError(campaignId);
  }

  if (current.status !== 'draft') {
    throw new CampaignStatusMismatchError(campaignId, current.status, 'draft');
  }

  await checkCampaignSegment(fields.segmentId, current.segmentId, current.isDemo);
  await checkCampaignOffice(fields.officeId, current.officeId, current.isDemo);

  const updated = await db
    .$transaction(async (transaction) => {
      if (!(await updateDraftCampaign(campaignId, fields, transaction))) {
        return false;
      }

      return updateDraftCampaignFirstHalf(
        campaignId,
        { startsOn: fields.startsOn, endsOn: fields.endsOn },
        transaction,
      );
    })
    .catch((error: unknown) => rethrowSlugConflict(error, fields.slug));

  if (!updated) {
    const after = await findCampaign(campaignId);

    if (!after) {
      throw new UnknownCampaignError(campaignId);
    }

    throw new CampaignStatusMismatchError(campaignId, after.status, 'draft');
  }

  return readCampaign(campaignId);
};
