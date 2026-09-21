import { consola } from 'consola';
import { findCampaign, setCampaignSecondHalfWindow } from '#server/repositories/campaigns';
import {
  CampaignSecondHalfUnavailableError,
  CampaignStatusMismatchError,
  UnknownCampaignError,
} from '#server/services/campaigns/errors';
import { readCampaign } from '#server/services/campaigns/readCampaign';
import type { CampaignResponse } from '#shared/types/campaign';

/**
 * Окно половины Б идущей акции — когда до неё дошла очередь.
 *
 * Назначается один раз: все условия в одном `UPDATE` («идёт», «было деление», «даты пусты»),
 * и второе нажатие окна не сдвинет. Правки назначенного окна нет — половина, чьё окно уже
 * могло начаться, увидела бы акцию и потеряла её.
 */
const log = consola.withTag('campaigns:second-half');

export const setCampaignSecondHalf = async (
  campaignId: string,
  window: { startsOn: string; endsOn: string },
): Promise<CampaignResponse> => {
  if (await setCampaignSecondHalfWindow(campaignId, window)) {
    log.info('окно половины Б назначено', { campaignId, ...window });

    return readCampaign(campaignId);
  }

  const current = await findCampaign(campaignId);

  if (!current) {
    throw new UnknownCampaignError(campaignId);
  }

  if (current.status !== 'running') {
    throw new CampaignStatusMismatchError(campaignId, current.status, 'running');
  }

  throw new CampaignSecondHalfUnavailableError(
    campaignId,
    current.splitEnabled ? 'already_set' : 'no_split',
  );
};
