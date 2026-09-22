import { findMemberCampaign, markParticipantOpened } from '#server/repositories/campaigns';
import { CHEST_REVEAL_HOURS } from '#server/services/campaigns/campaignClock';
import { presentMemberCampaign } from '#server/services/campaigns/memberCampaignScreen';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import type { MiniAppCampaignResponse } from '#shared/types/miniapp';

/**
 * Что у водителя с акцией — при открытии Mini App.
 *
 * Первое успешное чтение переводит `invited` в `opened`: водитель открыл экран, и акцию
 * он видел. Повторное чтение ничего не пишет — переход условием на `invited`.
 *
 * Не участнику и половине Б до её окна — `null`; после конца окна — `null` не вступившему,
 * а вступившему — только после вскрытия сундуков в 21:00 (issue #182): до него экран живёт,
 * чтобы забрать заработанное. Отсутствие акции — обычное состояние, а не ошибка
 * (`findMemberCampaign`).
 *
 * «Сейчас» приходит параметром: от него зависит, открыто ли окно, и тест задаёт его явно.
 */
export const readMemberCampaign = async (
  driver: LinkedDriver,
  now: Date,
): Promise<MiniAppCampaignResponse> => {
  const row = await findMemberCampaign(driver.personId, now, CHEST_REVEAL_HOURS);

  if (!row) {
    return { campaign: null };
  }

  if (row.state === 'invited' && (await markParticipantOpened(row.campaignId, driver.personId))) {
    return {
      campaign: await presentMemberCampaign({ ...row, state: 'opened' }, driver),
    };
  }

  return { campaign: await presentMemberCampaign(row, driver) };
};
