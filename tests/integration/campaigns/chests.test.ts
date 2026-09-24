import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { CampaignPrizeInput } from '#server/repositories/campaignPrizes';
import { createCampaign } from '#server/services/campaigns/createCampaign';
import {
  CampaignChestNotEarnedError,
  CampaignChestPrizeUnavailableError,
} from '#server/services/campaigns/errors';
import { launchCampaign } from '#server/services/campaigns/launchCampaign';
import { openCampaignChest } from '#server/services/campaigns/openCampaignChest';
import { readMemberCampaign } from '#server/services/campaigns/readMemberCampaign';
import { replaceCampaignPrizes } from '#server/services/campaigns/replaceCampaignPrizes';
import { joinCampaign } from '#server/services/campaigns/respondToCampaign';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { readMemberHistory } from '#server/services/drivers/readMemberHistory';
import { readMemberRewards } from '#server/services/rewards/readMemberRewards';
import { createSegment } from '#server/services/segments/createSegment';
import { receiveStock } from '#server/services/stock/receiveStock';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import type { MemberCampaignProgress } from '#shared/types/miniapp';
import {
  cleanupTestCampaigns,
  FULL_TEST_PRIZES,
  readChests,
  setParticipantJoinedAt,
  trackTestCampaign,
} from '../support/campaigns';
import {
  cleanupTestData,
  countTransfersByKey,
  createTestOffice,
  createTestPerson,
  createTestProduct,
  createTestTrip,
  disconnectDatabase,
  readAccountBalance,
  readStock,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { countRewardsByPerson } from '../support/rewards';
import { grantPoints } from '../support/points';
import { cleanupTestSegments, trackTestSegment } from '../support/segments';

/**
 * Открытие сундука акции (issue #181).
 *
 * Открытие рождает награду через `grantReward` и строку сундука одной транзакцией, повтор
 * отсекается строкой сундука, а заработан ли сундук, считается от журнала поездок тем же
 * сырым запросом, что экран. Всё это ядро начисления баллов (docs/infra.md → «Тесты»).
 * Гоняется через службу — тем путём, которым её зовёт ручка.
 *
 * Ташкент — UTC+5 без перевода часов. Окно 1–7 октября — `2026-10-01T00:00Z` … `2026-10-08T00:00Z`.
 */

const BALANCE_FROM = 7_181_000;
const BALANCE_TO = 7_181_999;

const WINDOW = { startsOn: '2026-10-01', endsOn: '2026-10-07' };

/** Момент по Ташкенту: `tashkent('2026-10-01 11:00')`. */
const tashkent = (moment: string): Date => new Date(`${moment.replace(' ', 'T')}:00+05:00`);

let slugSequence = 0;
let tripSequence = 0;

type Scenario = {
  campaignId: string;
  slug: string;
  officeId: string;
  employeeId: string;
  personId: string;
  profileId: string;
  /** Баланс до открытий — после фикстурной раздачи, которой водитель попал в сегмент. */
  balanceBefore: bigint;
};

const asDriver = (personId: string): LinkedDriver => ({
  personId,
  name: 'Тест',
  callsign: null,
  points: 0n,
  language: 'ru',
});

/** Акция на одного водителя, вступившего в начале окна. */
const launch = async (prizes: CampaignPrizeInput[] = FULL_TEST_PRIZES): Promise<Scenario> => {
  const driver = await createTestPerson({ inProgram: true });

  await grantPoints(driver.personId, BALANCE_FROM + 1);

  const { employeeId } = await createTestEmployee({ role: 'owner' });
  const segment = await createSegment(
    {
      name: 'Сундуки — тест',
      description: null,
      conditions: { ...EMPTY_SEGMENT_CONDITIONS, balanceMin: BALANCE_FROM, balanceMax: BALANCE_TO },
    },
    employeeId,
  );

  trackTestSegment(segment.segmentId);
  slugSequence += 1;

  const officeId = await createTestOffice();
  const slug = `test-chests-${Date.now()}-${slugSequence}`;
  const created = await createCampaign(
    {
      title: 'Неделя возвращения — сундуки',
      slug,
      segmentId: segment.segmentId,
      ...WINDOW,
      splitEnabled: false,
      officeId,
      rewardLifetimeDays: 7,
    },
    employeeId,
  );
  const campaignId = created.campaign.campaignId;

  trackTestCampaign(campaignId);
  await replaceCampaignPrizes(campaignId, prizes);
  await launchCampaign(campaignId);

  const joinedAt = tashkent('2026-10-01 06:00');

  await joinCampaign(asDriver(driver.personId), joinedAt);
  await setParticipantJoinedAt(campaignId, driver.personId, joinedAt);

  return {
    campaignId,
    slug,
    officeId,
    employeeId,
    personId: driver.personId,
    profileId: driver.profileId,
    balanceBefore: await readAccountBalance(driver.personId),
  };
};

/** Пять поездок в каждый из перечисленных дней окна — днём, в 12:00 по Ташкенту. */
const qualifyDays = async (profileId: string, days: readonly number[]): Promise<void> => {
  for (const day of days) {
    for (let trip = 0; trip < 5; trip += 1) {
      tripSequence += 1;
      await createTestTrip({
        profileId,
        tripOrderId: `test-chests-${profileId}-${tripSequence}`,
        status: COMPLETED_TRIP_STATUS,
        endedAt: tashkent(`2026-10-0${day} 12:${String(trip).padStart(2, '0')}`),
      });
    }
  }
};

const requireProgress = async (personId: string, now: Date): Promise<MemberCampaignProgress> => {
  const { campaign } = await readMemberCampaign(asDriver(personId), now);

  if (!campaign?.progress) {
    throw new Error('прогресса нет');
  }

  return campaign.progress;
};

describe('открытие сундука акции', () => {
  afterEach(async () => {
    await cleanupTestCampaigns();
    await cleanupTestSegments();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('один зачётный день — сундук дня к открытию, ступени закрыты и достижимы', async () => {
    const scenario = await launch();

    await qualifyDays(scenario.profileId, [1]);

    const progress = await requireProgress(scenario.personId, tashkent('2026-10-01 18:00'));

    expect(progress.chests.days.map((chest) => chest.state)).toEqual([
      'to_open',
      'ahead',
      'ahead',
      'ahead',
      'ahead',
      'ahead',
      'ahead',
    ]);
    expect(progress.chests.dayRow).toMatchObject({ state: 'to_open', caption: 'К открытию: 1' });
    expect(progress.chests.threeDays).toMatchObject({
      state: 'reachable',
      daysLeft: 2,
      caption: 'ещё 2 дня — и он ваш',
    });
    expect(progress.chests.week).toMatchObject({
      state: 'reachable',
      daysLeft: 4,
      caption: 'ещё 4 дня — и он ваш',
    });
  });

  it('сундук дня: баллы на баланс причиной «Акция», повтор — та же награда без второго начисления', async () => {
    const scenario = await launch();

    await qualifyDays(scenario.profileId, [1]);

    const now = tashkent('2026-10-01 18:00');
    const opened = await openCampaignChest(asDriver(scenario.personId), { kind: 'day', dayNumber: 1 }, now);

    expect(opened.prizeText).toBe('Ваш приз: 50 баллов');
    expect(opened.campaign?.progress?.chests.days[0]).toMatchObject({
      state: 'opened',
      label: 'открыт',
      prizeText: '50 баллов',
    });
    expect(await readAccountBalance(scenario.personId)).toBe(scenario.balanceBefore + 50n);

    const key = `campaign:${scenario.slug}:${scenario.personId}:day-1`;

    expect(await countTransfersByKey(key)).toBe(1);

    const history = await readMemberHistory({ personId: scenario.personId, language: 'ru', cursor: '' });

    expect(history.operations[0]).toMatchObject({ reason: 'Акция', delta: 50 });

    const [chest] = await readChests(scenario.campaignId, scenario.personId);
    const rewardsAfterFirst = await countRewardsByPerson(scenario.personId);

    expect(chest).toMatchObject({ kind: 'day', dayNumber: 1, openedBy: 'driver' });

    const repeated = await openCampaignChest(asDriver(scenario.personId), { kind: 'day', dayNumber: 1 }, now);

    expect(repeated.prizeText).toBe('Ваш приз: 50 баллов');
    expect(await countTransfersByKey(key)).toBe(1);
    expect(await countRewardsByPerson(scenario.personId)).toBe(rewardsAfterFirst);
    expect(await readChests(scenario.campaignId, scenario.personId)).toEqual([chest]);
    expect(await readAccountBalance(scenario.personId)).toBe(scenario.balanceBefore + 50n);
  });

  it('незаработанный сундук отбивается и ничего не пишет', async () => {
    const scenario = await launch();

    await qualifyDays(scenario.profileId, [1]);

    const driver = asDriver(scenario.personId);
    const now = tashkent('2026-10-02 18:00');

    // Сегодняшний день без цели, будущий день, день вне окна и ступени до порога.
    await expect(openCampaignChest(driver, { kind: 'day', dayNumber: 2 }, now)).rejects.toMatchObject({
      refusal: 'today',
    });
    await expect(openCampaignChest(driver, { kind: 'day', dayNumber: 3 }, now)).rejects.toMatchObject({
      refusal: 'ahead',
    });
    await expect(openCampaignChest(driver, { kind: 'day', dayNumber: 8 }, now)).rejects.toMatchObject({
      refusal: 'day_invalid',
    });
    await expect(openCampaignChest(driver, { kind: 'three_days' }, now)).rejects.toBeInstanceOf(
      CampaignChestNotEarnedError,
    );
    await expect(openCampaignChest(driver, { kind: 'week' }, now)).rejects.toMatchObject({
      refusal: 'reachable',
    });

    expect(await readChests(scenario.campaignId, scenario.personId)).toEqual([]);
    expect(await countRewardsByPerson(scenario.personId)).toBe(0);
  });

  it('погасший сундук недели не открывается: без зачётных дней — с четвёртого дня окна', async () => {
    const scenario = await launch();
    const now = tashkent('2026-10-04 10:00');
    const progress = await requireProgress(scenario.personId, now);

    expect(progress.chests.week).toMatchObject({ state: 'unreachable', caption: 'не в этот раз' });
    expect(progress.chests.threeDays.state).toBe('reachable');
    await expect(
      openCampaignChest(asDriver(scenario.personId), { kind: 'week' }, now),
    ).rejects.toMatchObject({ refusal: 'unreachable' });
  });

  it('третий зачётный день открывает сундук трёх дней сразу, пятый — сундук недели с наградой в офисе', async () => {
    const scenario = await launch();
    const driver = asDriver(scenario.personId);

    await qualifyDays(scenario.profileId, [1, 2, 3]);

    const third = await requireProgress(scenario.personId, tashkent('2026-10-03 18:00'));

    expect(third.chests.threeDays).toMatchObject({ state: 'to_open', caption: 'К открытию: 1' });

    const threeDays = await openCampaignChest(driver, { kind: 'three_days' }, tashkent('2026-10-03 18:00'));

    expect(threeDays.prizeText).toBe('Ваш приз: 200 баллов');
    expect(await countTransfersByKey(`campaign:${scenario.slug}:${scenario.personId}:three-days`)).toBe(1);

    await qualifyDays(scenario.profileId, [4, 5]);

    const week = await openCampaignChest(driver, { kind: 'week' }, tashkent('2026-10-05 18:00'));

    expect(week.prizeText).toBe('Ваш приз: Мойка');
    expect(week.campaign?.progress?.chests.week).toMatchObject({ state: 'opened', prizeText: 'Мойка' });

    const { rewards } = await readMemberRewards({ personId: scenario.personId, language: 'ru' });
    const wash = rewards.find((reward) => reward.title === 'Мойка');

    expect(wash).toMatchObject({ kind: 'custom', status: 'awaiting', officeName: 'Тестовый офис' });
    expect(wash?.code).toMatch(/^[5-9]\d{4}$/);
    expect(wash?.originText).toContain('Сундук недели');
  });

  it('приз-товар рождает награду с кодом, офисом акции и сроком и резервирует штуку', async () => {
    const productId = await createTestProduct({ pricePoints: null, promo: true });
    const scenario = await launch([
      { chest: 'day', kind: 'product', weight: 1, points: null, productId, title: null },
      ...FULL_TEST_PRIZES.filter((prize) => prize.chest !== 'day'),
    ]);

    await receiveStock({ officeId: scenario.officeId, productId, quantity: 1, employeeId: scenario.employeeId });
    await qualifyDays(scenario.profileId, [1]);

    const opened = await openCampaignChest(
      asDriver(scenario.personId),
      { kind: 'day', dayNumber: 1 },
      tashkent('2026-10-01 18:00'),
    );

    expect(opened.prizeText).toBe('Ваш приз: Тестовый товар');

    const { rewards } = await readMemberRewards({ personId: scenario.personId, language: 'ru' });

    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toMatchObject({
      kind: 'product',
      status: 'awaiting',
      title: 'Тестовый товар',
      officeName: 'Тестовый офис',
    });
    expect(rewards[0]?.code).toMatch(/^[5-9]\d{4}$/);
    expect(rewards[0]?.stateText).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    expect(rewards[0]?.originText).toContain('Сундук дня, день 1');
    expect(await readStock(scenario.officeId, productId)).toEqual({ onHand: 0, reserved: 1 });
  });

  it('товара нет на полке — отказ, сундук остаётся закрытым и заработанным, не пишется ничего', async () => {
    const productId = await createTestProduct({ pricePoints: null, promo: true });
    const scenario = await launch([
      { chest: 'day', kind: 'product', weight: 1, points: null, productId, title: null },
      ...FULL_TEST_PRIZES.filter((prize) => prize.chest !== 'day'),
    ]);

    await qualifyDays(scenario.profileId, [1]);

    const now = tashkent('2026-10-01 18:00');

    await expect(
      openCampaignChest(asDriver(scenario.personId), { kind: 'day', dayNumber: 1 }, now),
    ).rejects.toMatchObject({ failure: 'stock_short' });
    await expect(
      openCampaignChest(asDriver(scenario.personId), { kind: 'day', dayNumber: 1 }, now),
    ).rejects.toBeInstanceOf(CampaignChestPrizeUnavailableError);

    expect(await readChests(scenario.campaignId, scenario.personId)).toEqual([]);
    expect(await countRewardsByPerson(scenario.personId)).toBe(0);

    const progress = await requireProgress(scenario.personId, now);

    expect(progress.chests.days[0]?.state).toBe('to_open');
  });

  it('семь зачётных дней — семь сундуков дня и ничего сверх них', async () => {
    const scenario = await launch();
    const driver = asDriver(scenario.personId);
    const now = tashkent('2026-10-07 18:00');

    await qualifyDays(scenario.profileId, [1, 2, 3, 4, 5, 6, 7]);

    for (const dayNumber of [1, 2, 3, 4, 5, 6, 7]) {
      await openCampaignChest(driver, { kind: 'day', dayNumber }, now);
    }

    await openCampaignChest(driver, { kind: 'three_days' }, now);
    await openCampaignChest(driver, { kind: 'week' }, now);

    const chests = await readChests(scenario.campaignId, scenario.personId);

    expect(chests.filter((chest) => chest.kind === 'day').map((chest) => chest.dayNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(chests).toHaveLength(9);
    expect(await countRewardsByPerson(scenario.personId)).toBe(9);

    const progress = await requireProgress(scenario.personId, now);

    expect(progress.chests.dayRow).toMatchObject({ state: 'opened', opened: 7, toOpen: 0 });
  });

  it('опоздавшая поездка дозачитывает вчерашний день, и его сундук открывается', async () => {
    const scenario = await launch();

    // Четыре поездки вчера — день не зачтён; пятая того же дня доехала из Fleet API сегодня.
    for (let trip = 0; trip < 4; trip += 1) {
      tripSequence += 1;
      await createTestTrip({
        profileId: scenario.profileId,
        tripOrderId: `test-chests-${scenario.profileId}-${tripSequence}`,
        status: COMPLETED_TRIP_STATUS,
        endedAt: tashkent(`2026-10-01 1${trip}:00`),
      });
    }

    const now = tashkent('2026-10-02 10:00');

    await expect(
      openCampaignChest(asDriver(scenario.personId), { kind: 'day', dayNumber: 1 }, now),
    ).rejects.toMatchObject({ refusal: 'missed' });

    tripSequence += 1;
    await createTestTrip({
      profileId: scenario.profileId,
      tripOrderId: `test-chests-${scenario.profileId}-${tripSequence}`,
      status: COMPLETED_TRIP_STATUS,
      endedAt: tashkent('2026-10-01 23:30'),
    });

    const opened = await openCampaignChest(asDriver(scenario.personId), { kind: 'day', dayNumber: 1 }, now);

    expect(opened.prizeText).toBe('Ваш приз: 50 баллов');
  });
});
