import { findMemberCampaign, markParticipantOpened } from '#server/repositories/campaigns';
import { describeMemberCampaign } from '#server/services/campaigns/memberCampaignScreen';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import type { MiniAppCampaignResponse } from '#shared/types/miniapp';

/**
 * Что у водителя с акцией — при открытии Mini App.
 *
 * Первое успешное чтение переводит `invited` в `opened`: водитель открыл экран, и акцию
 * он видел. Повторное чтение ничего не пишет — переход условием на `invited`.
 *
 * Не участнику, половине Б до её окна и после конца окна — `null`: отсутствие акции —
 * обычное состояние, а не ошибка (`findMemberCampaign`).
 *
 * «Сейчас» приходит параметром: от него зависит, открыто ли окно, и тест задаёт его явно.
 */
export const readMemberCampaign = async (
  driver: LinkedDriver,
  now: Date,
): Promise<MiniAppCampaignResponse> => {
  const row = await findMemberCampaign(driver.personId, now);

  if (!row) {
    return { campaign: null };
  }

  if (row.state === 'invited' && (await markParticipantOpened(row.campaignId, driver.personId))) {
    return { campaign: describeMemberCampaign({ ...row, state: 'opened' }, driver.language) };
  }

  return { campaign: describeMemberCampaign(row, driver.language) };
};
