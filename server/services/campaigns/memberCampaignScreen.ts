import { plainText, type TextKey } from '#server/bot/texts';
import type { CampaignParticipantState, Language } from '#server/generated/prisma/enums';
import type { MemberCampaignRow } from '#server/repositories/campaigns';
import type { MemberCampaign } from '#shared/types/miniapp';

/**
 * Во что превращается участие водителя на экране акции. Решений здесь нет — только перевод
 * строки базы на язык водителя. Живёт отдельным модулем, потому что вызывающих три: чтение
 * экрана, «Участвовать» и «Отказаться» отвечают одним и тем же видом.
 */

/**
 * Текст состояния на каждое значение. Полной таблицей: новое состояние обязано уронить сборку
 * здесь и заставить написать текст, а не показаться водителю латинским словом.
 */
const STATE_KEYS: Readonly<Record<CampaignParticipantState, TextKey>> = {
  invited: 'campaign_state_invited',
  opened: 'campaign_state_invited',
  joined: 'campaign_state_joined',
  declined: 'campaign_state_declined',
};

/** Дата окна `YYYY-MM-DD` → `01.10.2026`: цифрами, одинаково на обоих языках. */
const formatWindowDay = (day: string): string => {
  const [year, month, date] = day.split('-');

  return year && month && date ? `${date}.${month}.${year}` : day;
};

export const describeMemberCampaign = (
  row: MemberCampaignRow,
  language: Language,
): MemberCampaign => ({
  title: row.title,
  window: plainText('campaign_window', language, {
    from: formatWindowDay(row.startsOn),
    to: formatWindowDay(row.endsOn),
  }),
  state: row.state,
  stateText: plainText(STATE_KEYS[row.state], language),
  canRespond: row.state === 'invited' || row.state === 'opened',
  joinLabel: plainText('button_campaign_join', language),
  declineLabel: plainText('campaign_decline', language),
});
