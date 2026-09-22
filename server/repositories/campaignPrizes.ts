import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { CampaignChestKind, RewardKind } from '#server/generated/prisma/enums';

/**
 * Призы сундуков акции (issue #180): чем наполнен сундук и с каким весом разыгрывается.
 *
 * Набор правится только целиком — удалением прежнего и вставкой нового в одной транзакции.
 * Построчных правок нет: между ними веса сундука не сходились бы.
 *
 * Схема в сыром SQL указывается явно — `xb.campaign_prizes`, а не `campaign_prizes`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

type Executor = Prisma.TransactionClient;

export type CampaignPrizeRow = {
  id: string;
  chest: CampaignChestKind;
  kind: RewardKind;
  weight: number;
  points: number | null;
  productId: string | null;
  productName: string | null;
  productPublishedAt: Date | null;
  productArchivedAt: Date | null;
  title: string | null;
};

/**
 * Варианты акции по сундукам, внутри сундука — по убыванию веса: частый вариант первым.
 * Порядок набора не хранится: набор — таблица долей, а не список.
 */
export const listCampaignPrizes = async (
  campaignId: string,
  client: Executor = db,
): Promise<CampaignPrizeRow[]> =>
  client.$queryRaw<CampaignPrizeRow[]>`
    SELECT prize."id",
           prize."chest",
           prize."kind",
           prize."weight",
           prize."points",
           prize."product_id"    AS "productId",
           product."name"        AS "productName",
           product."published_at" AS "productPublishedAt",
           product."archived_at" AS "productArchivedAt",
           prize."title"
      FROM xb.campaign_prizes AS prize
      LEFT JOIN xb.products AS product ON product."id" = prize."product_id"
     WHERE prize."campaign_id" = ${campaignId}::uuid
     ORDER BY prize."chest", prize."weight" DESC, prize."id"
  `;

export type CampaignPrizeInput = {
  chest: CampaignChestKind;
  kind: RewardKind;
  weight: number;
  points: number | null;
  productId: string | null;
  title: string | null;
};

/**
 * Замена набора: прежние варианты удаляются, новые вставляются. Транзакцию открывает сервис —
 * вместе с блокировкой строки акции, которую берёт и запуск.
 */
export const replaceCampaignPrizeRows = async (
  campaignId: string,
  prizes: CampaignPrizeInput[],
  transaction: Executor,
): Promise<void> => {
  await transaction.$executeRaw`
    DELETE FROM xb.campaign_prizes WHERE "campaign_id" = ${campaignId}::uuid
  `;

  if (prizes.length === 0) {
    return;
  }

  const values = prizes.map(
    (prize) => Prisma.sql`(
      ${campaignId}::uuid,
      ${prize.chest}::xb.campaign_chest_kind,
      ${prize.kind}::xb.reward_kind,
      ${prize.weight}::int,
      ${prize.points}::int,
      ${prize.productId}::uuid,
      ${prize.title}
    )`,
  );

  await transaction.$executeRaw`
    INSERT INTO xb.campaign_prizes (
      "campaign_id", "chest", "kind", "weight", "points", "product_id", "title"
    )
    VALUES ${Prisma.join(values)}
  `;
};
