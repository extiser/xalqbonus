import { consola } from 'consola';
import type { Prisma } from '#server/generated/prisma/client';
import type { CampaignChestOpenSource } from '#server/generated/prisma/enums';
import { insertCampaignChest } from '#server/repositories/campaignChests';
import { listCampaignPrizes, type CampaignPrizeRow } from '#server/repositories/campaignPrizes';
import { findCampaign } from '#server/repositories/campaigns';
import type { RewardRow } from '#server/repositories/rewards';
import { CampaignChestPrizeUnavailableError } from '#server/services/campaigns/errors';
import { drawPrize } from '#server/services/campaigns/prizeDraw';
import {
  buildCampaignChestIdempotencyKey,
  type CampaignChestRef,
} from '#server/services/points/idempotencyKey';
import {
  RewardOfficeUnavailableError,
  RewardProductUnavailableError,
  RewardStockShortError,
} from '#server/services/rewards/errors';
import { grantRewardInTransaction, type RewardGift } from '#server/services/rewards/grantReward';

/**
 * Розыгрыш и выдача приза заработанного сундука — общая часть открытия водителем и вскрытия
 * таймером в 21:00 (issues #181, #182). Отдельного пути «зачислить за водителя» нет: он развёл бы
 * одно и то же событие на два способа с разными следами (docs/decisions.md → «Сундук открывается
 * сразу, как заработан»). Разница у путей одна — кто открыл, `opened_by`.
 *
 * Зовётся внутри транзакции, которая уже держит блокировку строки участия и проверила, что сундук
 * заработан и не открыт:
 *
 * 1. вариант приза выбирается по весам ступени; у фиксированных ступеней он один;
 * 2. награда рождается через `grantRewardInTransaction`;
 * 3. вставляется строка сундука со ссылкой на награду.
 *
 * Шаги 2 и 3 обязаны идти вместе: награда без строки сундука дала бы второй розыгрыш при
 * следующем открытии, строка без награды — открытый сундук без приза.
 *
 * **Розыгрыш один раз и навсегда**: что выпало, то выпало. Единственное исключение — приз,
 * который нельзя выдать (товара нет на полке): тогда откатывается всё, сундук остаётся
 * закрытым и заработанным, и водитель не узнаёт, что выпало, — иначе повторное открытие
 * стало бы осознанной пересдачей (решение Руслана по #181).
 */

const log = consola.withTag('campaigns:chest');

type Transaction = Prisma.TransactionClient;

export const chestDayNumber = (chest: CampaignChestRef): number | null =>
  chest.kind === 'day' ? chest.dayNumber : null;

/** Пояснение на карточке награды — то, что сотрудник увидит у стойки. */
const chestNote = (chest: CampaignChestRef): string => {
  switch (chest.kind) {
    case 'day':
      return `Сундук дня, день ${chest.dayNumber}`;
    case 'three_days':
      return 'Сундук трёх дней';
    case 'week':
      return 'Сундук недели';
  }
};

type CampaignRewardSettings = {
  campaignId: string;
  slug: string;
  officeId: string;
  lifetimeDays: number;
};

const buildGift = (
  prize: CampaignPrizeRow,
  settings: CampaignRewardSettings,
  personId: string,
  chest: CampaignChestRef,
): RewardGift => {
  if (prize.kind === 'points' && prize.points !== null) {
    return {
      kind: 'points',
      points: prize.points,
      reason: 'campaign',
      idempotencyKey: buildCampaignChestIdempotencyKey(settings.slug, personId, chest),
    };
  }

  if (prize.kind === 'product' && prize.productId !== null) {
    return {
      kind: 'product',
      productId: prize.productId,
      officeId: settings.officeId,
      lifetimeDays: settings.lifetimeDays,
    };
  }

  if (prize.kind === 'custom' && prize.title !== null) {
    return {
      kind: 'custom',
      title: prize.title,
      officeId: settings.officeId,
      lifetimeDays: settings.lifetimeDays,
    };
  }

  // Согласованность вида и полей держит `campaign_prizes_kind_fields_check`.
  throw new Error(`вариант приза ${prize.id} не согласован со своим видом ${prize.kind}`);
};

/** Настройки наград акции. У идущей они есть всегда — запуск без них не проходит. */
const readRewardSettings = async (
  campaignId: string,
  transaction: Transaction,
): Promise<CampaignRewardSettings> => {
  const campaign = await findCampaign(campaignId, transaction);

  if (!campaign?.slug || !campaign.officeId || campaign.rewardLifetimeDays === null) {
    throw new Error(`у идущей акции ${campaignId} нет метки, офиса или срока наград`);
  }

  return {
    campaignId,
    slug: campaign.slug,
    officeId: campaign.officeId,
    lifetimeDays: campaign.rewardLifetimeDays,
  };
};

/**
 * Отказ выдачи приза → отказ открытия. Отказ по остатку пишется в лог отдельной строкой
 * с акцией, сундуком, товаром и офисом: это сигнал парку. Что выпало, водитель не узнаёт.
 */
const explainPrizeFailure = (
  error: unknown,
  settings: CampaignRewardSettings,
  chest: CampaignChestRef,
  personId: string,
  openedBy: CampaignChestOpenSource,
): CampaignChestPrizeUnavailableError | null => {
  const context = {
    campaignId: settings.campaignId,
    chest: chest.kind,
    dayNumber: chestDayNumber(chest),
    personId,
    openedBy,
  };

  if (error instanceof RewardStockShortError) {
    log.warn('приз сундука не выдан: товара нет на полке офиса акции', {
      ...context,
      productId: error.productId,
      officeId: error.officeId,
    });

    return new CampaignChestPrizeUnavailableError(settings.campaignId, chest.kind, 'stock_short');
  }

  if (error instanceof RewardProductUnavailableError) {
    log.warn('приз сундука не выдан: товар снят с выдачи', { ...context, productId: error.productId });

    return new CampaignChestPrizeUnavailableError(
      settings.campaignId,
      chest.kind,
      'product_unavailable',
    );
  }

  if (error instanceof RewardOfficeUnavailableError) {
    log.warn('приз сундука не выдан: офис акции закрыт', { ...context, officeId: error.officeId });

    return new CampaignChestPrizeUnavailableError(
      settings.campaignId,
      chest.kind,
      'office_unavailable',
    );
  }

  return null;
};

export type GrantChestPrizeInput = {
  campaignId: string;
  personId: string;
  chest: CampaignChestRef;
  openedBy: CampaignChestOpenSource;
};

/** Разыгрывает приз, выдаёт награду и пишет строку сундука. Возвращает рождённую награду. */
export const grantChestPrizeInTransaction = async (
  transaction: Transaction,
  input: GrantChestPrizeInput,
): Promise<RewardRow> => {
  const { campaignId, personId, chest, openedBy } = input;
  const settings = await readRewardSettings(campaignId, transaction);
  const prizes = (await listCampaignPrizes(campaignId, transaction)).filter(
    (prize) => prize.chest === chest.kind,
  );
  const prize = drawPrize(prizes);

  // Запуск без наполнения всех трёх сундуков не проходит (`prizes_missing`).
  if (!prize) {
    throw new Error(`у акции ${campaignId} нет призов сундука ${chest.kind}`);
  }

  let reward: RewardRow;

  try {
    reward = await grantRewardInTransaction(transaction, {
      personId,
      gift: buildGift(prize, settings, personId, chest),
      origin: { source: 'campaign', campaignId, note: chestNote(chest) },
    });
  } catch (error) {
    throw explainPrizeFailure(error, settings, chest, personId, openedBy) ?? error;
  }

  await insertCampaignChest(
    {
      campaignId,
      personId,
      kind: chest.kind,
      dayNumber: chestDayNumber(chest),
      openedBy,
      rewardId: reward.id,
    },
    transaction,
  );

  return reward;
};
