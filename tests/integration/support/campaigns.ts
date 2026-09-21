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
