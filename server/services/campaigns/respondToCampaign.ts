import { consola } from 'consola';
import {
  findMemberCampaign,
  markParticipantDeclined,
  markParticipantJoined,
} from '#server/repositories/campaigns';
import { describeMemberCampaign } from '#server/services/campaigns/memberCampaignScreen';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import type { MiniAppCampaignResponse } from '#shared/types/miniapp';

/**
 * Ответ водителя на акцию — «Участвовать» или «Отказаться».
 *
 * Действует только на акцию, которая ему сейчас видна: вне окна и вне состава ответ тот же,
 * что у чтения экрана, — «акции нет», а не отказ.
 *
 * Назад состояния не ходят: из `joined` в `declined` и обратно — нет. Повтор той же кнопки
 * отвечает успехом и ничего не меняет — водитель нажимает дважды чаще, чем кажется. Переход
 * пишется условием на прежнее состояние, поэтому ответ перечитывается после записи и говорит,
 * что в базе на самом деле.
 */
const log = consola.withTag('campaigns:respond');

const respond = async (
  driver: LinkedDriver,
  now: Date,
  move: (campaignId: string, personId: string) => Promise<boolean>,
  action: 'joined' | 'declined',
): Promise<MiniAppCampaignResponse> => {
  const visible = await findMemberCampaign(driver.personId, now);

  if (!visible) {
    return { campaign: null };
  }

  if (await move(visible.campaignId, driver.personId)) {
    log.info('водитель ответил на акцию', {
      campaignId: visible.campaignId,
      personId: driver.personId,
      state: action,
    });
  }

  const after = await findMemberCampaign(driver.personId, now);

  return { campaign: after ? describeMemberCampaign(after, driver.language) : null };
};

/** «Участвовать»: `invited | opened → joined`. */
export const joinCampaign = (driver: LinkedDriver, now: Date): Promise<MiniAppCampaignResponse> =>
  respond(driver, now, markParticipantJoined, 'joined');

/** «Отказаться»: `invited | opened → declined`. */
export const declineCampaign = (
  driver: LinkedDriver,
  now: Date,
): Promise<MiniAppCampaignResponse> => respond(driver, now, markParticipantDeclined, 'declined');
