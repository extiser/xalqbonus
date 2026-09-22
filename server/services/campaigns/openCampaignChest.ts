import { consola } from 'consola';
import { plainText } from '#server/bot/texts';
import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import { findOpenedChest, type OpenedChestRow } from '#server/repositories/campaignChests';
import {
  findMemberCampaign,
  lockCampaignParticipant,
  readParticipantDayTrips,
  type MemberCampaignRow,
} from '#server/repositories/campaigns';
import { CHEST_REVEAL_HOURS } from '#server/services/campaigns/campaignClock';
import {
  CampaignChestNotEarnedError,
  MemberCampaignUnavailableError,
  type CampaignChestRefusal,
} from '#server/services/campaigns/errors';
import {
  chestDayNumber,
  grantChestPrizeInTransaction,
} from '#server/services/campaigns/grantChestPrize';
import { presentMemberCampaign } from '#server/services/campaigns/memberCampaignScreen';
import { chestPrizeText, frozenFigures } from '#server/services/campaigns/memberProgress';
import { chestLadder, weekFigures, type ChestLadder } from '#server/services/campaigns/weekProgress';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import type { CampaignChestRef } from '#server/services/points/idempotencyKey';
import type { MiniAppOpenChestResponse } from '#shared/types/miniapp';

/**
 * Открытие сундука акции водителем (issue #181). Всё одной транзакцией:
 *
 * 1. строка участия берётся под блокировку — два нажатия подряд идут по очереди;
 * 2. **сундук уже открыт — отдаём его награду и выходим.** Не ошибка: ответ мог потеряться
 *    по дороге, а повторный розыгрыш означал бы второй приз;
 * 3. прогресс считается от журнала — тем же путём, что экран (`chestLadder`), после итога —
 *    от снимка. Не заработан — `CampaignChestNotEarnedError`;
 * 4. розыгрыш, награда и строка сундука — `grantChestPrizeInTransaction`, тот же путь, которым
 *    неоткрытое вскрывает таймер в 21:00 (issue #182).
 *
 * Открыть можно, пока экран акции водителю виден: после конца окна — до вскрытия в 21:00.
 *
 * «Сейчас» приходит параметром — от него зависит день окна, как у чтения экрана.
 */

const log = consola.withTag('campaigns:chest');

type Transaction = Prisma.TransactionClient;

/** Что выпало — то, что нужно ответу. У повтора — из строки сундука, у первого открытия — из награды. */
type OpenedPrize = Pick<OpenedChestRow, 'rewardId' | 'rewardKind' | 'rewardTitle' | 'rewardPoints'>;

/** Лестница участника на момент открытия — от журнала или, после итога, от снимка. */
const readLadder = async (
  row: MemberCampaignRow,
  personId: string,
  transaction: Transaction,
): Promise<ChestLadder> => {
  if (row.outcome !== null) {
    const { figures, dayTrips } = frozenFigures(row);

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

type OpenOutcome = { prize: OpenedPrize; replay: boolean; campaignId: string };

const openInTransaction = async (
  transaction: Transaction,
  personId: string,
  chest: CampaignChestRef,
  now: Date,
): Promise<OpenOutcome> => {
  const row = await findMemberCampaign(personId, now, CHEST_REVEAL_HOURS, transaction);

  if (!row || !(await lockCampaignParticipant(row.campaignId, personId, transaction))) {
    throw new MemberCampaignUnavailableError(personId);
  }

  const dayNumber = chestDayNumber(chest);
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

  const reward = await grantChestPrizeInTransaction(transaction, {
    campaignId: row.campaignId,
    personId,
    chest,
    openedBy: 'driver',
  });

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
    const after = await findMemberCampaign(driver.personId, now, CHEST_REVEAL_HOURS, transaction);

    return {
      ...opened,
      campaign: after ? await presentMemberCampaign(after, driver, transaction) : null,
    };
  });

  log.info(outcome.replay ? 'сундук уже был открыт — отдана прежняя награда' : 'сундук открыт', {
    campaignId: outcome.campaignId,
    personId: driver.personId,
    chest: chest.kind,
    dayNumber: chestDayNumber(chest),
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
