import { plainText, type TextKey } from '#server/bot/texts';
import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import type { CampaignParticipantState, Language } from '#server/generated/prisma/enums';
import { listOpenedChests } from '#server/repositories/campaignChests';
import { readParticipantDayTrips, type MemberCampaignRow } from '#server/repositories/campaigns';
import {
  describeCampaignFinish,
  describeFrozenProgress,
  describeLiveProgress,
} from '#server/services/campaigns/memberProgress';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
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
 *
 * Открытые сундуки читаются в обеих ветках (issue #181): открытие — факт, а не счёт, и снимок
 * итога его не хранит.
 */
const readMemberProgress = async (
  row: MemberCampaignRow,
  personId: string,
  language: Language,
  client: Prisma.TransactionClient,
): Promise<MemberCampaignProgress | null> => {
  if (row.joinedAt === null) {
    return null;
  }

  const opened = await listOpenedChests(row.campaignId, personId, client);

  if (row.outcome !== null) {
    return describeFrozenProgress({ ...row, outcome: row.outcome }, opened, language);
  }

  const dayTrips = await readParticipantDayTrips(row.campaignId, personId, client);

  return describeLiveProgress(row, dayTrips, opened, language);
};

/** Кому показывается экран: имя — для поздравления в блоке завершения. */
export type CampaignViewer = Pick<LinkedDriver, 'personId' | 'name' | 'language'>;

const describeMemberCampaign = (
  row: MemberCampaignRow,
  viewer: CampaignViewer,
  progress: MemberCampaignProgress | null,
): MemberCampaign => ({
  title: row.title,
  window: plainText('campaign_window', viewer.language, {
    from: formatWindowDay(row.startsOn),
    to: formatWindowDay(row.endsOn),
  }),
  state: row.state,
  stateText: plainText(STATE_KEYS[row.state], viewer.language),
  canRespond: row.state === 'invited' || row.state === 'opened',
  joinLabel: plainText('button_campaign_join', viewer.language),
  declineLabel: plainText('campaign_decline', viewer.language),
  progress,
  finish: progress ? describeCampaignFinish(row, progress, viewer.name, viewer.language) : null,
});

/**
 * Экран акции водителя: строка участия на его языке, прогресс недели и блок завершения. `client` —
 * транзакция открытия сундука: экран после открытия читается внутри неё и видит только что записанное.
 */
export const presentMemberCampaign = async (
  row: MemberCampaignRow,
  viewer: CampaignViewer,
  client: Prisma.TransactionClient = db,
): Promise<MemberCampaign> =>
  describeMemberCampaign(
    row,
    viewer,
    await readMemberProgress(row, viewer.personId, viewer.language, client),
  );
