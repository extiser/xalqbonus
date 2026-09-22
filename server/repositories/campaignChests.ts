import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import type {
  CampaignChestKind,
  CampaignChestOpenSource,
  RewardKind,
} from '#server/generated/prisma/enums';

/**
 * Открытые сундуки акции (issue #181). Строка — на открытие, а не на заработанный сундук:
 * заработан ли он, считается от журнала поездок.
 *
 * Второе открытие держат частичные уникальные индексы `campaign_chests_day_key`
 * и `campaign_chests_step_key`, а не проверка перед вставкой.
 *
 * Схема в сыром SQL указывается явно — `xb.campaign_chests`, а не `campaign_chests`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

type Executor = Prisma.TransactionClient;

/** Открытый сундук с тем, что из него выпало. */
export type OpenedChestRow = {
  kind: CampaignChestKind;
  /** Только у сундука дня. */
  dayNumber: number | null;
  rewardId: string;
  rewardKind: RewardKind;
  rewardTitle: string;
  rewardPoints: number | null;
};

/** Все открытые сундуки участия — для лестницы на экране. */
export const listOpenedChests = async (
  campaignId: string,
  personId: string,
  client: Executor = db,
): Promise<OpenedChestRow[]> =>
  client.$queryRaw<OpenedChestRow[]>`
    SELECT chest."kind",
           chest."day_number" AS "dayNumber",
           reward."id"        AS "rewardId",
           reward."kind"      AS "rewardKind",
           reward."title"     AS "rewardTitle",
           reward."points"    AS "rewardPoints"
      FROM xb.campaign_chests AS chest
      JOIN xb.rewards AS reward ON reward."id" = chest."reward_id"
     WHERE chest."campaign_id" = ${campaignId}::uuid
       AND chest."person_id" = ${personId}::uuid
     ORDER BY chest."kind", chest."day_number"
  `;

/** Открытый сундук участника — без награды: для счёта неоткрытых по всей акции. */
export type OpenedChestRefRow = {
  personId: string;
  kind: CampaignChestKind;
  dayNumber: number | null;
};

/**
 * Открытые сундуки всех участников акции разом — одним запросом на прогон итога, а не
 * запросом на человека: сообщение об итоге называет число неоткрытых (issue #182).
 */
export const listCampaignOpenedChests = async (
  campaignId: string,
  client: Executor = db,
): Promise<OpenedChestRefRow[]> =>
  client.$queryRaw<OpenedChestRefRow[]>`
    SELECT chest."person_id"  AS "personId",
           chest."kind",
           chest."day_number" AS "dayNumber"
      FROM xb.campaign_chests AS chest
     WHERE chest."campaign_id" = ${campaignId}::uuid
  `;

/**
 * Открытый сундук по ступени и дню. `dayNumber` — только у сундука дня; у остальных `null`,
 * и сравнение `IS NOT DISTINCT FROM` находит их строку, у которой дня нет.
 */
export const findOpenedChest = async (
  campaignId: string,
  personId: string,
  kind: CampaignChestKind,
  dayNumber: number | null,
  client: Executor = db,
): Promise<OpenedChestRow | null> => {
  const rows = await client.$queryRaw<OpenedChestRow[]>`
    SELECT chest."kind",
           chest."day_number" AS "dayNumber",
           reward."id"        AS "rewardId",
           reward."kind"      AS "rewardKind",
           reward."title"     AS "rewardTitle",
           reward."points"    AS "rewardPoints"
      FROM xb.campaign_chests AS chest
      JOIN xb.rewards AS reward ON reward."id" = chest."reward_id"
     WHERE chest."campaign_id" = ${campaignId}::uuid
       AND chest."person_id" = ${personId}::uuid
       AND chest."kind" = ${kind}::xb.campaign_chest_kind
       AND chest."day_number" IS NOT DISTINCT FROM ${dayNumber}::int
  `;

  return rows[0] ?? null;
};

export type InsertCampaignChestInput = {
  campaignId: string;
  personId: string;
  kind: CampaignChestKind;
  dayNumber: number | null;
  openedBy: CampaignChestOpenSource;
  rewardId: string;
};

/**
 * Строка открытого сундука. Без `ON CONFLICT`: открытие идёт под блокировкой участия,
 * и второй строке взяться неоткуда — конфликт здесь означает поломку, и транзакция обязана
 * откатиться вместе с наградой.
 */
export const insertCampaignChest = async (
  input: InsertCampaignChestInput,
  transaction: Executor,
): Promise<void> => {
  await transaction.$executeRaw`
    INSERT INTO xb.campaign_chests (
      "campaign_id", "person_id", "kind", "day_number", "opened_by", "reward_id"
    )
    VALUES (
      ${input.campaignId}::uuid,
      ${input.personId}::uuid,
      ${input.kind}::xb.campaign_chest_kind,
      ${input.dayNumber}::int,
      ${input.openedBy}::xb.campaign_chest_open_source,
      ${input.rewardId}::uuid
    )
  `;
};
