import { db } from '#server/db';
import type { CampaignPrizeInput } from '#server/repositories/campaignPrizes';
import { replaceCampaignPrizes } from '#server/services/campaigns/replaceCampaignPrizes';

/**
 * Уборка акций, заведённых тестом.
 *
 * Уходит первой из всех: снимок ссылается на людей, акция — на сегмент и автора, и все
 * внешние ключи стоят на `RESTRICT`. Внутри — сундуки, награды акции, снимок, окна и призы
 * раньше самой акции; призы к тому же ссылаются на товары, которые уборка каталога снимает позже.
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
    // Сундуки — первыми: они ссылаются на участие и на награду. Награды акции уходят здесь,
    // а не с людьми: они ссылаются на акцию ключом `RESTRICT`. Движения их резерва — до них,
    // иначе `SET NULL` обнулил бы `reward_id` у `reward_reserve` и нарушил проверку знаков.
    await transaction.$executeRaw`
      DELETE FROM xb.campaign_chests WHERE "campaign_id" = ANY(${campaignIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.stock_movements
       WHERE "reward_id" IN (
             SELECT "id" FROM xb.rewards WHERE "campaign_id" = ANY(${campaignIds}::uuid[])
       )
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.rewards WHERE "campaign_id" = ANY(${campaignIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.campaign_participants WHERE "campaign_id" = ANY(${campaignIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.campaign_halves WHERE "campaign_id" = ANY(${campaignIds}::uuid[])
    `;
    await transaction.$executeRaw`
      DELETE FROM xb.campaign_prizes WHERE "campaign_id" = ANY(${campaignIds}::uuid[])
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

/**
 * Сдвигает момент вступления. Кнопка пишет `now()` базы, а сценариям нужен момент внутри
 * окна, заданного тестом, — «четыре поездки до вступления и одна после».
 */
export const setParticipantJoinedAt = async (
  campaignId: string,
  personId: string,
  joinedAt: Date,
): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.campaign_participants
       SET "joined_at" = ${joinedAt}::timestamptz
     WHERE "campaign_id" = ${campaignId}::uuid
       AND "person_id" = ${personId}::uuid
  `;
};

export type ParticipantOutcomeSnapshot = {
  personId: string;
  outcome: string | null;
  outcomeAt: Date | null;
  qualifiedDays: number | null;
  dayTrips: number[] | null;
};

/** Исход и снимок построчно — то, что лежит в базе, мимо сервисов. */
export const readParticipantOutcomes = async (
  campaignId: string,
): Promise<ParticipantOutcomeSnapshot[]> =>
  db.$queryRaw<ParticipantOutcomeSnapshot[]>`
    SELECT "person_id"       AS "personId",
           "outcome"::text   AS "outcome",
           "outcome_at"      AS "outcomeAt",
           "qualified_days"  AS "qualifiedDays",
           "day_trips"       AS "dayTrips"
      FROM xb.campaign_participants
     WHERE "campaign_id" = ${campaignId}::uuid
     ORDER BY "person_id"
  `;

/**
 * Набор, с которым акция запускается: по варианту в каждом сундуке, без товаров — тестам запуска
 * каталог не нужен (issue #180).
 */
export const FULL_TEST_PRIZES: CampaignPrizeInput[] = [
  { chest: 'day', kind: 'points', weight: 1, points: 50, productId: null, title: null },
  { chest: 'three_days', kind: 'points', weight: 1, points: 200, productId: null, title: null },
  { chest: 'week', kind: 'custom', weight: 1, points: null, productId: null, title: 'Мойка' },
];

/** Наполняет все три сундука черновика — без этого запуск отказывает `prizes_missing`. */
export const fillTestPrizes = async (campaignId: string): Promise<void> => {
  await replaceCampaignPrizes(campaignId, FULL_TEST_PRIZES);
};

/**
 * Пишет вариант приза мимо сервисов — так выглядела бы запись, забывшая проверки разбора.
 * Нужна, чтобы проверить, что правила вида, веса и единственности держит база.
 */
export const insertPrizeBypassingServices = async (
  campaignId: string,
  prize: CampaignPrizeInput,
): Promise<void> => {
  await db.$executeRaw`
    INSERT INTO xb.campaign_prizes (
      "campaign_id", "chest", "kind", "weight", "points", "product_id", "title"
    )
    VALUES (
      ${campaignId}::uuid,
      ${prize.chest}::xb.campaign_chest_kind,
      ${prize.kind}::xb.reward_kind,
      ${prize.weight}::int,
      ${prize.points}::int,
      ${prize.productId}::uuid,
      ${prize.title}
    )
  `;
};

export type ChestSnapshot = {
  kind: string;
  dayNumber: number | null;
  openedBy: string;
  rewardId: string;
};

/** Открытые сундуки участника построчно — то, что лежит в базе, мимо сервисов. */
export const readChests = async (campaignId: string, personId: string): Promise<ChestSnapshot[]> =>
  db.$queryRaw<ChestSnapshot[]>`
    SELECT "kind"::text      AS "kind",
           "day_number"      AS "dayNumber",
           "opened_by"::text AS "openedBy",
           "reward_id"       AS "rewardId"
      FROM xb.campaign_chests
     WHERE "campaign_id" = ${campaignId}::uuid
       AND "person_id" = ${personId}::uuid
     ORDER BY "kind", "day_number"
  `;
