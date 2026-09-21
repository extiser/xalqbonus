import { plainText, type TextKey } from '#server/bot/texts';
import type { CampaignParticipantState, Language } from '#server/generated/prisma/enums';
import { readParticipantDayTrips, type MemberCampaignRow } from '#server/repositories/campaigns';
import {
  describeFrozenProgress,
  describeLiveProgress,
} from '#server/services/campaigns/memberProgress';
import type { MemberCampaign, MemberCampaignProgress } from '#shared/types/miniapp';

/**
 * Во что превращается участие водителя на экране акции. Живёт отдельным модулем, потому что
 * вызывающих три: чтение экрана, «Участвовать» и «Отказаться» отвечают одним и тем же видом.
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

/**
 * Прогресс недели участника (issue #168). Без вступления его нет вовсе: считать не от чего.
 * Исход проставлен — неделя рисуется из снимка итога, и журнал не читается совсем: сколько
 * бы поездок ни доехало после итога, числа стоят те, что объявлены.
 */
const readMemberProgress = async (
  row: MemberCampaignRow,
  personId: string,
  language: Language,
): Promise<MemberCampaignProgress | null> => {
  if (row.joinedAt === null) {
    return null;
  }

  if (row.outcome !== null) {
    return describeFrozenProgress({ ...row, outcome: row.outcome }, language);
  }

  const dayTrips = await readParticipantDayTrips(row.campaignId, personId);

  return describeLiveProgress(row, dayTrips, language);
};

const describeMemberCampaign = (
  row: MemberCampaignRow,
  language: Language,
  progress: MemberCampaignProgress | null,
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
  progress,
});

/** Экран акции водителя: строка участия на его языке и прогресс недели. */
export const presentMemberCampaign = async (
  row: MemberCampaignRow,
  personId: string,
  language: Language,
): Promise<MemberCampaign> =>
  describeMemberCampaign(row, language, await readMemberProgress(row, personId, language));
