import { db } from '#server/db';

/**
 * Уборка акций, заведённых тестом.
 *
 * Уходит первой из всех: снимок ссылается на людей, акция — на сегмент и автора, и все
 * внешние ключи стоят на `RESTRICT`. Внутри — снимок и окна раньше самой акции.
 */

const createdCampaignIds = new Set<string>();

export const trackTestCampaign = (campaignId: string): void => {
  createdCampaignIds.add(campaignId);
};

export const cleanupTestCampaigns = async (): Promise<void> => {
  const campaignIds = [...createdCampaignIds];
  createdCampaignIds.clear();

  if (campaignIds.length === 0) {
    return;
  }

  await db.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      DELETE FROM xb.campaign_participants WHERE "campaign_id" = ANY(${campaignIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.campaign_halves WHERE "campaign_id" = ANY(${campaignIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.campaigns WHERE "id" = ANY(${campaignIds}::uuid[])
    `;
  });
};

export type ParticipantSnapshot = {
  personId: string;
  half: string;
  state: string;
  openedAt: Date | null;
  joinedAt: Date | null;
  declinedAt: Date | null;
};

/** Снимок акции построчно — то, что лежит в базе, мимо сервисов. */
export const readParticipants = async (campaignId: string): Promise<ParticipantSnapshot[]> =>
  db.$queryRaw<ParticipantSnapshot[]>`
    SELECT "person_id"     AS "personId",
           "half"::text    AS "half",
           "state"::text   AS "state",
           "opened_at"     AS "openedAt",
           "joined_at"     AS "joinedAt",
           "declined_at"   AS "declinedAt"
      FROM xb.campaign_participants
     WHERE "campaign_id" = ${campaignId}::uuid
     ORDER BY "person_id"
  `;

export type ParticipantWindowSnapshot = {
  personId: string;
  half: string;
  /** Есть ли у половины участника строка окна. */
  hasWindow: boolean;
};

/** Участник и строка окна его половины — соединением, которым окно читают сервисы. */
export const readParticipantWindows = async (
  campaignId: string,
): Promise<ParticipantWindowSnapshot[]> =>
  db.$queryRaw<ParticipantWindowSnapshot[]>`
    SELECT participant."person_id"             AS "personId",
           participant."half"::text            AS "half",
           (half."campaign_id" IS NOT NULL)     AS "hasWindow"
      FROM xb.campaign_participants AS participant
      LEFT JOIN xb.campaign_halves AS half
        ON half."campaign_id" = participant."campaign_id"
       AND half."half" = participant."half"
     WHERE participant."campaign_id" = ${campaignId}::uuid
  `;

/**
 * Пишет участника мимо сервисов — так выглядела бы запись, забывшая завести окно половины.
 * Нужна, чтобы проверить, что это держит база, а не порядок вызовов в коде.
 */
export const insertParticipantBypassingServices = async (
  campaignId: string,
  personId: string,
  half: 'a' | 'b',
): Promise<void> => {
  await db.$executeRaw`
    INSERT INTO xb.campaign_participants ("campaign_id", "person_id", "half", "state")
    VALUES (
      ${campaignId}::uuid,
      ${personId}::uuid,
      ${half}::xb.campaign_half,
      'invited'::xb.campaign_participant_state
    )
  `;
};
