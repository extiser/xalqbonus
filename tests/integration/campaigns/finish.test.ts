import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { CampaignPrizeInput } from '#server/repositories/campaignPrizes';
import { createCampaign } from '#server/services/campaigns/createCampaign';
import { launchCampaign } from '#server/services/campaigns/launchCampaign';
import { openCampaignChest } from '#server/services/campaigns/openCampaignChest';
import { readCampaign } from '#server/services/campaigns/readCampaign';
import { readMemberCampaign } from '#server/services/campaigns/readMemberCampaign';
import { replaceCampaignPrizes } from '#server/services/campaigns/replaceCampaignPrizes';
import { joinCampaign } from '#server/services/campaigns/respondToCampaign';
import { revealCampaignChests } from '#server/services/campaigns/revealCampaignChests';
import { settleCampaignOutcomes } from '#server/services/campaigns/settleCampaignOutcomes';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { readMemberRewards } from '#server/services/rewards/readMemberRewards';
import { createSegment } from '#server/services/segments/createSegment';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import type { MemberCampaign } from '#shared/types/miniapp';
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
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';
import { disconnectQueues } from '../support/queues';
import { countRewardsByPerson } from '../support/rewards';
import { cleanupTestSegments, trackTestSegment } from '../support/segments';

/**
 * Завершение акции и вскрытие сундуков (issue #182).
 *
 * Экран живёт после конца окна до вскрытия, итог в 09:00 ставит сообщение с числом неоткрытых,
 * вскрытие в 21:00 открывает неоткрытое тем же путём, что водитель, и зачисляет призы — это ядро
 * начисления баллов (docs/infra.md → «Тесты»). Гоняется через службы — тем путём, которым их
 * зовут ручка и воркер.
 *
 * Уведомления уходят в настоящую очередь; что поставлено, тест читает из сводки прогона,
 * а не из Redis — в нём может жить очередь локального стека.
 *
 * Ташкент — UTC+5 без перевода часов. Окно 1–7 октября — `2026-10-01T00:00Z` … `2026-10-08T00:00Z`;
 * итог — 09:00 восьмого, вскрытие — 21:00 восьмого.
 */

const BALANCE_FROM = 7_182_000;
const BALANCE_TO = 7_182_999;

const WINDOW = { startsOn: '2026-10-01', endsOn: '2026-10-07' };

/** Момент по Ташкенту: `tashkent('2026-10-01 11:00')`. */
const tashkent = (moment: string): Date => new Date(`${moment.replace(' ', 'T')}:00+05:00`);

let slugSequence = 0;
let tripSequence = 0;

type Scenario = {
  campaignId: string;
  slug: string;
  personId: string;
  profileId: string;
  balanceBefore: bigint;
};

const asDriver = (personId: string): LinkedDriver => ({
  personId,
  name: 'Тест',
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
      name: 'Завершение акции — тест',
      description: null,
      conditions: { ...EMPTY_SEGMENT_CONDITIONS, balanceMin: BALANCE_FROM, balanceMax: BALANCE_TO },
    },
    employeeId,
  );

  trackTestSegment(segment.segmentId);
  slugSequence += 1;

  const officeId = await createTestOffice();
  const slug = `test-finish-${Date.now()}-${slugSequence}`;
  const created = await createCampaign(
    {
      title: 'Неделя возвращения — финиш',
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
    personId: driver.personId,
    profileId: driver.profileId,
    balanceBefore: await readAccountBalance(driver.personId),
  };
};

/** Поездки в день окна — днём, с 12:00 по Ташкенту. */
const addTrips = async (profileId: string, day: number, count: number): Promise<void> => {
  for (let trip = 0; trip < count; trip += 1) {
    tripSequence += 1;
    await createTestTrip({
      profileId,
      tripOrderId: `test-finish-${profileId}-${tripSequence}`,
      status: COMPLETED_TRIP_STATUS,
      endedAt: tashkent(`2026-10-0${day} 12:${String(trip).padStart(2, '0')}`),
    });
  }
};

const qualifyDays = async (profileId: string, days: readonly number[]): Promise<void> => {
  for (const day of days) {
    await addTrips(profileId, day, 5);
  }
};

/**
 * Уведомления прогона — только этого водителя: прогон берёт все акции базы, и акция, забытая
 * упавшим прогоном другого файла, не должна ломать сравнение.
 */
const notificationsOf = <Job extends { personId: string }>(
  jobs: readonly Job[],
  personId: string,
): Job[] => jobs.filter((job) => job.personId === personId);

const requireCampaign = async (personId: string, now: Date): Promise<MemberCampaign> => {
  const { campaign } = await readMemberCampaign(asDriver(personId), now);

  if (!campaign) {
    throw new Error('акции нет');
  }

  return campaign;
};

describe('завершение акции и вскрытие сундуков', () => {
  afterEach(async () => {
    await cleanupTestCampaigns();
    await cleanupTestSegments();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectQueues();
    await disconnectDatabase();
  });

  it('взявший цель в последний день видит завершённую акцию сразу и открывает заработанное', async () => {
    const scenario = await launch();

    await qualifyDays(scenario.profileId, [1, 2, 3, 4]);

    const beforeGoal = await requireCampaign(scenario.personId, tashkent('2026-10-07 11:00'));

    // Последний день, цель не взята: сундук дня ещё можно взять — акция идёт.
    expect(beforeGoal.progress?.chestDays).toBe(1);
    expect(beforeGoal.finish).toBeNull();

    await qualifyDays(scenario.profileId, [7]);

    const now = tashkent('2026-10-07 13:00');
    const finished = await requireCampaign(scenario.personId, now);

    expect(finished.progress?.chestDays).toBe(0);
    expect(finished.finish).toEqual({
      kind: 'completed',
      title: 'Поздравляем, Тест! Ваша акция завершена',
      text: 'Собрано: 5 сундуков дня, сундук трёх дней, сундук недели',
    });

    const opened = await openCampaignChest(asDriver(scenario.personId), { kind: 'week' }, now);

    expect(opened.prizeText).toBe('Ваш приз: Мойка');
    expect(await readChests(scenario.campaignId, scenario.personId)).toEqual([
      expect.objectContaining({ kind: 'week', openedBy: 'driver' }),
    ]);
  });

  it('не дотянувший до 09:00 видит «итоги утром», а не объявленный проигрыш', async () => {
    const scenario = await launch();

    await qualifyDays(scenario.profileId, [1, 2, 4, 6]);
    await addTrips(scenario.profileId, 7, 3);

    const lastEvening = await requireCampaign(scenario.personId, tashkent('2026-10-07 23:00'));

    expect(lastEvening.finish).toBeNull();

    const morning = await requireCampaign(scenario.personId, tashkent('2026-10-08 06:00'));

    expect(morning.finish).toEqual({
      kind: 'awaiting_outcome',
      title: 'Акция для вас завершена',
      text: 'Итоги подводятся утром — загляните после 09:00.',
    });
    // Окно кончилось: неделя замерла, но читается ещё от журнала, и «сегодня» у неё нет.
    expect(morning.progress).toMatchObject({ frozen: false, outcome: null, today: null, day: 7 });

    const settled = await settleCampaignOutcomes(tashkent('2026-10-08 09:00'));

    expect(settled.notifications).toContainEqual({
      personId: scenario.personId,
      template: 'campaign_finished',
      params: {
        title: 'Неделя возвращения — финиш',
        outcome: 'short',
        qualifiedDays: 4,
        windowDays: 7,
        unopenedChests: 5,
      },
    });

    const afterOutcome = await requireCampaign(scenario.personId, tashkent('2026-10-08 10:00'));

    expect(afterOutcome.progress).toMatchObject({ frozen: true, outcome: 'short' });
    expect(afterOutcome.finish?.kind).toBe('open_chests');
  });

  it('открывший всё сам видит акцию до 21:00: итог в 09:00 её не оканчивает', async () => {
    const scenario = await launch();
    const driver = asDriver(scenario.personId);

    await qualifyDays(scenario.profileId, [1, 2, 3]);

    const evening = tashkent('2026-10-03 18:00');

    for (const dayNumber of [1, 2, 3]) {
      await openCampaignChest(driver, { kind: 'day', dayNumber }, evening);
    }

    await openCampaignChest(driver, { kind: 'three_days' }, evening);

    const settled = await settleCampaignOutcomes(tashkent('2026-10-08 09:00'));

    expect(notificationsOf(settled.notifications, scenario.personId)).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ unopenedChests: 0 }) }),
    ]);
    // Неоткрытого нет ни у кого, но вскрытие не прошло — акция идёт, экран жив.
    expect((await readCampaign(scenario.campaignId)).campaign.status).toBe('running');

    const morning = await requireCampaign(scenario.personId, tashkent('2026-10-08 10:00'));

    expect(morning.finish).toEqual({
      kind: 'completed',
      title: 'Поздравляем, Тест! Ваша акция завершена',
      text: 'Собрано: 3 сундука дня, сундук трёх дней',
    });

    // Повторный итог после обеда — всё ещё до вскрытия.
    await settleCampaignOutcomes(tashkent('2026-10-08 14:00'));
    expect((await readCampaign(scenario.campaignId)).campaign.status).toBe('running');

    const reveal = tashkent('2026-10-08 21:00');
    const revealed = await revealCampaignChests(reveal);

    expect(notificationsOf(revealed.notifications, scenario.personId)).toEqual([]);
    expect((await readMemberCampaign(driver, reveal)).campaign).toBeNull();
    expect((await readCampaign(scenario.campaignId)).campaign.status).toBe('finished');
  });

  it('невыдаваемый приз откатывает только свой сундук: остальные вскрыты, уведомление — о выданном', async () => {
    // Товар без прихода — на полке ноль: приз сундука трёх дней выдать нельзя.
    const productId = await createTestProduct({ pricePoints: null, promo: true });
    const scenario = await launch([
      ...FULL_TEST_PRIZES.filter((prize) => prize.chest !== 'three_days'),
      { chest: 'three_days', kind: 'product', weight: 1, points: null, productId, title: null },
    ]);
    const driver = asDriver(scenario.personId);

    await qualifyDays(scenario.profileId, [1, 2, 3, 4, 5]);

    const evening = tashkent('2026-10-05 18:00');

    for (const dayNumber of [1, 2, 3, 4]) {
      await openCampaignChest(driver, { kind: 'day', dayNumber }, evening);
    }

    await settleCampaignOutcomes(tashkent('2026-10-08 09:00'));

    // Неоткрытых три: день 5, трёхдневный (товара нет), недельный.
    const revealed = await revealCampaignChests(tashkent('2026-10-08 21:00'));

    expect(revealed.failed).toBeGreaterThanOrEqual(1);

    const timerChests = (await readChests(scenario.campaignId, scenario.personId)).filter(
      (chest) => chest.openedBy === 'timer',
    );

    expect(timerChests).toEqual([
      expect.objectContaining({ kind: 'day', dayNumber: 5 }),
      expect.objectContaining({ kind: 'week', dayNumber: null }),
    ]);
    expect(await readAccountBalance(scenario.personId)).toBe(scenario.balanceBefore + 250n);
    expect(notificationsOf(revealed.notifications, scenario.personId)).toEqual([
      expect.objectContaining({
        template: 'campaign_chests_revealed',
        params: expect.objectContaining({
          prizes: [
            { kind: 'points', points: 50 },
            { kind: 'office', title: 'Мойка' },
          ],
        }),
      }),
    ]);

    // Невыданный остался закрытым и заработанным — акция идёт, следующий прогон попробует снова.
    expect((await readCampaign(scenario.campaignId)).campaign.status).toBe('running');

    const again = await revealCampaignChests(tashkent('2026-10-08 21:15'));

    expect(notificationsOf(again.notifications, scenario.personId)).toEqual([]);
    expect(await readChests(scenario.campaignId, scenario.personId)).toHaveLength(6);
  });

  it('неоткрытое живёт до 21:00, вскрывается таймером, акция гаснет и оканчивается; повтор ничего не удваивает', async () => {
    const scenario = await launch();
    const driver = asDriver(scenario.personId);

    await qualifyDays(scenario.profileId, [1, 2, 3, 5, 7]);
    await openCampaignChest(driver, { kind: 'day', dayNumber: 1 }, tashkent('2026-10-01 18:00'));

    // После конца окна, до итога: экран виден, открывать можно.
    const earlyMorning = tashkent('2026-10-08 07:00');

    expect((await requireCampaign(scenario.personId, earlyMorning)).finish?.kind).toBe('open_chests');
    await openCampaignChest(driver, { kind: 'day', dayNumber: 2 }, earlyMorning);

    const settled = await settleCampaignOutcomes(tashkent('2026-10-08 09:00'));

    expect(notificationsOf(settled.notifications, scenario.personId)).toEqual([
      {
        personId: scenario.personId,
        template: 'campaign_finished',
        params: {
          title: 'Неделя возвращения — финиш',
          outcome: 'returned',
          qualifiedDays: 5,
          windowDays: 7,
          unopenedChests: 5,
        },
      },
    ]);
    // Неоткрытое осталось — акция идёт, иначе экран погас бы за полдня до вскрытия.
    expect((await readCampaign(scenario.campaignId)).campaign.status).toBe('running');

    // Повторный итог второго сообщения не шлёт.
    const settledAgain = await settleCampaignOutcomes(tashkent('2026-10-08 09:15'));

    expect(notificationsOf(settledAgain.notifications, scenario.personId)).toEqual([]);

    const beforeReveal = tashkent('2026-10-08 20:59');

    expect((await requireCampaign(scenario.personId, beforeReveal)).finish?.kind).toBe('open_chests');
    const early = await revealCampaignChests(beforeReveal);

    expect(notificationsOf(early.notifications, scenario.personId)).toEqual([]);
    expect(await readChests(scenario.campaignId, scenario.personId)).toHaveLength(2);

    const revealed = await revealCampaignChests(tashkent('2026-10-08 21:00'));

    expect(revealed.failed).toBe(0);
    expect(await readChests(scenario.campaignId, scenario.personId)).toEqual([
      expect.objectContaining({ kind: 'day', dayNumber: 1, openedBy: 'driver' }),
      expect.objectContaining({ kind: 'day', dayNumber: 2, openedBy: 'driver' }),
      expect.objectContaining({ kind: 'day', dayNumber: 3, openedBy: 'timer' }),
      expect.objectContaining({ kind: 'day', dayNumber: 5, openedBy: 'timer' }),
      expect.objectContaining({ kind: 'day', dayNumber: 7, openedBy: 'timer' }),
      expect.objectContaining({ kind: 'three_days', dayNumber: null, openedBy: 'timer' }),
      expect.objectContaining({ kind: 'week', dayNumber: null, openedBy: 'timer' }),
    ]);

    // Баллы — на балансе: пять сундуков дня по 50 и трёхдневный на 200.
    expect(await readAccountBalance(scenario.personId)).toBe(scenario.balanceBefore + 450n);
    expect(await countTransfersByKey(`campaign:${scenario.slug}:${scenario.personId}:day-7`)).toBe(1);

    // Произвольный приз — наградой с кодом и сроком в «Мои награды и призы».
    const { rewards } = await readMemberRewards({ personId: scenario.personId, language: 'ru' });
    const wash = rewards.find((reward) => reward.title === 'Мойка');

    expect(wash).toMatchObject({ kind: 'custom', status: 'awaiting', officeName: 'Тестовый офис' });
    expect(wash?.code).toMatch(/^[5-9]\d{4}$/);

    const revealNotifications = notificationsOf(revealed.notifications, scenario.personId);
    const [notification] = revealNotifications;

    expect(revealNotifications).toHaveLength(1);
    expect(notification).toMatchObject({
      personId: scenario.personId,
      template: 'campaign_chests_revealed',
      params: {
        title: 'Неделя возвращения — финиш',
        prizes: [
          { kind: 'points', points: 50 },
          { kind: 'points', points: 50 },
          { kind: 'points', points: 50 },
          { kind: 'points', points: 200 },
          { kind: 'office', title: 'Мойка' },
        ],
        officeName: 'Тестовый офис',
      },
    });
    expect(
      notification?.template === 'campaign_chests_revealed' && notification.params.expiresAt,
    ).toBeTruthy();

    // После вскрытия экран гаснет, акция окончена.
    expect((await readMemberCampaign(driver, tashkent('2026-10-08 21:00'))).campaign).toBeNull();
    expect((await readCampaign(scenario.campaignId)).campaign.status).toBe('finished');

    // Повтор вскрытия: ни второго приза, ни второго уведомления.
    const rewardsAfter = await countRewardsByPerson(scenario.personId);
    const repeated = await revealCampaignChests(tashkent('2026-10-08 21:15'));

    expect(notificationsOf(repeated.notifications, scenario.personId)).toEqual([]);
    expect(await countRewardsByPerson(scenario.personId)).toBe(rewardsAfter);
    expect(await readAccountBalance(scenario.personId)).toBe(scenario.balanceBefore + 450n);
  });
});
