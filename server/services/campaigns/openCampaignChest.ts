import { consola } from 'consola';
import { plainText } from '#server/bot/texts';
import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import {
  findOpenedChest,
  insertCampaignChest,
  type OpenedChestRow,
} from '#server/repositories/campaignChests';
import { listCampaignPrizes, type CampaignPrizeRow } from '#server/repositories/campaignPrizes';
import {
  findCampaign,
  findMemberCampaign,
  lockCampaignParticipant,
  readParticipantDayTrips,
  type MemberCampaignRow,
} from '#server/repositories/campaigns';
import type { RewardRow } from '#server/repositories/rewards';
import {
  CampaignChestNotEarnedError,
  CampaignChestPrizeUnavailableError,
  MemberCampaignUnavailableError,
  type CampaignChestRefusal,
} from '#server/services/campaigns/errors';
import { presentMemberCampaign } from '#server/services/campaigns/memberCampaignScreen';
import { chestPrizeText, frozenFigures } from '#server/services/campaigns/memberProgress';
import { drawPrize } from '#server/services/campaigns/prizeDraw';
import { chestLadder, weekFigures, type ChestLadder } from '#server/services/campaigns/weekProgress';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
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
import type { MiniAppOpenChestResponse } from '#shared/types/miniapp';

/**
 * Открытие сундука акции водителем (issue #181). Всё одной транзакцией:
 *
 * 1. строка участия берётся под блокировку — два нажатия подряд идут по очереди;
 * 2. **сундук уже открыт — отдаём его награду и выходим.** Не ошибка: ответ мог потеряться
 *    по дороге, а повторный розыгрыш означал бы второй приз;
 * 3. прогресс считается от журнала — тем же путём, что экран (`chestLadder`), после итога —
 *    от снимка. Не заработан — `CampaignChestNotEarnedError`;
 * 4. вариант приза выбирается по весам ступени; у фиксированных ступеней он один;
 * 5. награда рождается через `grantRewardInTransaction`;
 * 6. вставляется строка сундука со ссылкой на награду.
 *
 * Шаги 5 и 6 обязаны идти вместе: награда без строки сундука дала бы второй розыгрыш при
 * следующем нажатии, строка без награды — открытый сундук без приза.
 *
 * **Розыгрыш один раз и навсегда**: что выпало, то выпало. Единственное исключение — приз,
 * который нельзя выдать (товара нет на полке): тогда откатывается всё, сундук остаётся
 * закрытым и заработанным, и водитель не узнаёт, что выпало, — иначе повторное нажатие
 * стало бы осознанной пересдачей (решение Руслана по #181).
 *
 * «Сейчас» приходит параметром — от него зависит день окна, как у чтения экрана.
 */

const log = consola.withTag('campaigns:chest');

type Transaction = Prisma.TransactionClient;

/** Что выпало — то, что нужно ответу. У повтора — из строки сундука, у первого открытия — из награды. */
type OpenedPrize = Pick<OpenedChestRow, 'rewardId' | 'rewardKind' | 'rewardTitle' | 'rewardPoints'>;

const dayNumberOf = (chest: CampaignChestRef): number | null =>
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

/** Лестница участника на момент открытия — от журнала или, после итога, от снимка. */
const readLadder = async (
  row: MemberCampaignRow,
  personId: string,
  transaction: Transaction,
): Promise<ChestLadder> => {
  if (row.outcome !== null) {
    const { figures, dayTrips } = frozenFigures({ ...row, outcome: row.outcome });

    return chestLadder(figures, dayTrips, []);
  }

  const dayTrips = await readParticipantDayTrips(row.campaignId, personId, transaction);

  return chestLadder(weekFigures(row.windowDays, row.day, dayTrips), dayTrips, []);
};

/** Почему не открывается — `null`, если сундук заработан и ждёт. */
const refusalOf = (ladder: ChestLadder, chest: CampaignChestRef): CampaignChestRefusal | null => {
  if (chest.kind !== 'day') {
    const state = chest.kind === 'three_days' ? ladder.threeDays : ladder.week;

    // `opened` отсюда не приходит: лестница считается без открытых сундуков, а открытый
    // нашёлся по своей строке раньше. Ветка держит тип — отказа «открыт» нет.
    return state === 'to_open' || state === 'opened' ? null : state;
  }

  const day = ladder.days[chest.dayNumber - 1];

  if (!day) {
    return 'day_invalid';
  }

  // `opened` — тем же доводом, что у ступеней.
  return day.state === 'to_open' || day.state === 'opened' ? null : day.state;
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
 * с акцией, сундуком, товаром и офисом: это сигнал парку, за который зацепится уведомление
 * админу (#182). Что выпало, водитель не узнаёт.
 */
const explainPrizeFailure = (
  error: unknown,
  settings: CampaignRewardSettings,
  chest: CampaignChestRef,
  personId: string,
): CampaignChestPrizeUnavailableError | null => {
  const context = {
    campaignId: settings.campaignId,
    chest: chest.kind,
    dayNumber: dayNumberOf(chest),
    personId,
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

type OpenOutcome = { prize: OpenedPrize; replay: boolean; campaignId: string };

const openInTransaction = async (
  transaction: Transaction,
  personId: string,
  chest: CampaignChestRef,
  now: Date,
): Promise<OpenOutcome> => {
  const row = await findMemberCampaign(personId, now, transaction);

  if (!row || !(await lockCampaignParticipant(row.campaignId, personId, transaction))) {
    throw new MemberCampaignUnavailableError(personId);
  }

  const dayNumber = dayNumberOf(chest);
  const existing = await findOpenedChest(row.campaignId, personId, chest.kind, dayNumber, transaction);

  if (existing) {
    return { prize: existing, replay: true, campaignId: row.campaignId };
  }

  if (row.joinedAt === null) {
    throw new CampaignChestNotEarnedError(personId, chest.kind, dayNumber, 'not_joined');
  }

  const refusal = refusalOf(await readLadder(row, personId, transaction), chest);

  if (refusal) {
    throw new CampaignChestNotEarnedError(personId, chest.kind, dayNumber, refusal);
  }

  const settings = await readRewardSettings(row.campaignId, transaction);
  const prizes = (await listCampaignPrizes(row.campaignId, transaction)).filter(
    (prize) => prize.chest === chest.kind,
  );
  const prize = drawPrize(prizes);

  // Запуск без наполнения всех трёх сундуков не проходит (`prizes_missing`).
  if (!prize) {
    throw new Error(`у акции ${row.campaignId} нет призов сундука ${chest.kind}`);
  }

  let reward: RewardRow;

  try {
    reward = await grantRewardInTransaction(transaction, {
      personId,
      gift: buildGift(prize, settings, personId, chest),
      origin: { source: 'campaign', campaignId: row.campaignId, note: chestNote(chest) },
    });
  } catch (error) {
    throw explainPrizeFailure(error, settings, chest, personId) ?? error;
  }

  await insertCampaignChest(
    {
      campaignId: row.campaignId,
      personId,
      kind: chest.kind,
      dayNumber,
      openedBy: 'driver',
      rewardId: reward.id,
    },
    transaction,
  );

  return {
    prize: {
      rewardId: reward.id,
      rewardKind: reward.kind,
      rewardTitle: reward.title,
      rewardPoints: reward.points,
    },
    replay: false,
    campaignId: row.campaignId,
  };
};

/**
 * Экран после открытия читается в той же транзакции: он обязан показать ровно то, что записано,
 * а не то, что успело поменяться между коммитом и чтением.
 */
export const openCampaignChest = async (
  driver: LinkedDriver,
  chest: CampaignChestRef,
  now: Date,
): Promise<MiniAppOpenChestResponse> => {
  const outcome = await db.$transaction(async (transaction) => {
    const opened = await openInTransaction(transaction, driver.personId, chest, now);
    const after = await findMemberCampaign(driver.personId, now, transaction);

    return {
      ...opened,
      campaign: after
        ? await presentMemberCampaign(after, driver.personId, driver.language, transaction)
        : null,
    };
  });

  log.info(outcome.replay ? 'сундук уже был открыт — отдана прежняя награда' : 'сундук открыт', {
    campaignId: outcome.campaignId,
    personId: driver.personId,
    chest: chest.kind,
    dayNumber: dayNumberOf(chest),
    rewardId: outcome.prize.rewardId,
    rewardKind: outcome.prize.rewardKind,
  });

  return {
    campaign: outcome.campaign,
    prizeText: plainText('campaign_chest_prize', driver.language, {
      prize: chestPrizeText(outcome.prize, driver.language),
    }),
    rewardsHint: plainText('campaign_chest_rewards_hint', driver.language),
  };
};
