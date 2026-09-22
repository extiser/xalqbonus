import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { createCampaign } from '#server/services/campaigns/createCampaign';
import { launchCampaign } from '#server/services/campaigns/launchCampaign';
import { readCampaign } from '#server/services/campaigns/readCampaign';
import { readCampaignParticipants } from '#server/services/campaigns/readCampaignParticipants';
import { readMemberCampaign } from '#server/services/campaigns/readMemberCampaign';
import { revealCampaignChests } from '#server/services/campaigns/revealCampaignChests';
import { declineCampaign, joinCampaign } from '#server/services/campaigns/respondToCampaign';
import { settleCampaignOutcomes } from '#server/services/campaigns/settleCampaignOutcomes';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { createSegment } from '#server/services/segments/createSegment';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import type { MemberCampaignProgress } from '#shared/types/miniapp';
import {
  cleanupTestCampaigns,
  fillTestPrizes,
  readParticipantOutcomes,
  setParticipantJoinedAt,
  trackTestCampaign,
} from '../support/campaigns';
import {
  cleanupTestData,
  createTestOffice,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';
import { disconnectQueues } from '../support/queues';
import { cleanupTestSegments, trackTestSegment } from '../support/segments';

/**
 * Прогресс недели и итог окна (issue #168).
 *
 * Поездки по дням считаются одним сырым запросом: резка суток с 05:00 по Ташкенту, отсечка
 * по вступлению, поездки через все профили человека, дни без поездок — нулём. Итог окна пишет
 * исход со снимком условием в `UPDATE`. Всё это сырой SQL по чужим таблицам — поездкам,
 * профилям, окнам, — и миграция в любой из них ломает счёт молча (docs/infra.md → «Тесты»,
 * третье исключение). Гоняется через сервисы — тем путём, которым их зовут ручка и воркер.
 *
 * Ташкент — UTC+5 без перевода часов: 05:00 там — 00:00 UTC. Окно 1–7 октября —
 * `2026-10-01T00:00Z` … `2026-10-08T00:00Z`, итог — не раньше `2026-10-08T04:00Z` (09:00).
 */

const BALANCE_FROM = 7_168_000;
const BALANCE_TO = 7_168_999;

const WINDOW = { startsOn: '2026-10-01', endsOn: '2026-10-07' };

/** Момент по Ташкенту: `tashkent('2026-10-01 11:00')`. */
const tashkent = (moment: string): Date => new Date(`${moment.replace(' ', 'T')}:00+05:00`);

let slugSequence = 0;
let tripSequence = 0;

type Driver = { personId: string; profileId: string };

type Setup = {
  campaignId: string;
  drivers: Driver[];
};

const asDriver = (personId: string): LinkedDriver => ({
  personId,
  name: 'Тест',
  points: 0n,
  language: 'ru',
});

const launch = async (count: number, splitEnabled = false): Promise<Setup> => {
  const drivers: Driver[] = [];

  for (let index = 0; index < count; index += 1) {
    const driver = await createTestPerson({ inProgram: true });

    await grantPoints(driver.personId, BALANCE_FROM + index + 1);
    drivers.push(driver);
  }

  const { employeeId } = await createTestEmployee({ role: 'owner' });
  const segment = await createSegment(
    {
      name: 'Прогресс недели — тест',
      description: null,
      conditions: { ...EMPTY_SEGMENT_CONDITIONS, balanceMin: BALANCE_FROM, balanceMax: BALANCE_TO },
    },
    employeeId,
  );

  trackTestSegment(segment.segmentId);

  slugSequence += 1;

  const officeId = await createTestOffice();

  const created = await createCampaign(
    {
      title: 'Неделя возвращения — прогресс',
      slug: `test-progress-${Date.now()}-${slugSequence}`,
      segmentId: segment.segmentId,
      ...WINDOW,
      splitEnabled,
      officeId,
      rewardLifetimeDays: 7,
    },
    employeeId,
  );
  const campaignId = created.campaign.campaignId;

  trackTestCampaign(campaignId);
  await fillTestPrizes(campaignId);
  await launchCampaign(campaignId);

  return { campaignId, drivers };
};

/** Вступление в заданный момент: кнопкой, затем момент переносится туда, куда нужно сценарию. */
const joinAt = async (campaignId: string, personId: string, joinedAt: Date): Promise<void> => {
  await joinCampaign(asDriver(personId), joinedAt);
  await setParticipantJoinedAt(campaignId, personId, joinedAt);
};

const addTrips = async (
  profileId: string,
  endedAt: Date,
  count = 1,
  status: string = COMPLETED_TRIP_STATUS,
): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    tripSequence += 1;
    await createTestTrip({
      profileId,
      tripOrderId: `test-progress-${profileId}-${tripSequence}`,
      status,
      endedAt: new Date(endedAt.getTime() + index * 60_000),
    });
  }
};

const readProgress = async (personId: string, now: Date): Promise<MemberCampaignProgress | null> => {
  const { campaign } = await readMemberCampaign(asDriver(personId), now);

  if (!campaign) {
    throw new Error('акция водителю не видна');
  }

  return campaign.progress;
};

const requireProgress = async (personId: string, now: Date): Promise<MemberCampaignProgress> => {
  const progress = await readProgress(personId, now);

  if (!progress) {
    throw new Error('прогресса нет');
  }

  return progress;
};

describe('прогресс недели и итог окна', () => {
  afterEach(async () => {
    await cleanupTestCampaigns();
    await cleanupTestSegments();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(async () => {
    // Итог окна ставит сообщения в очередь (issue #182) — соединение закрывается за собой.
    await disconnectQueues();
    await disconnectDatabase();
  });

  it('пять поездок в первый день — день зачтён; шестая второго дня не делает', async () => {
    const { campaignId, drivers } = await launch(1);
    const [driver] = drivers;

    if (!driver) throw new Error('нет водителя');

    await joinAt(campaignId, driver.personId, tashkent('2026-10-01 10:00'));
    await addTrips(driver.profileId, tashkent('2026-10-01 11:00'), 5);

    const afterFive = await requireProgress(driver.personId, tashkent('2026-10-01 18:00'));

    expect(afterFive.day).toBe(1);
    expect(afterFive.windowDays).toBe(7);
    expect(afterFive.days[0]).toEqual({
      day: 1,
      date: '2026-10-01',
      trips: 5,
      qualified: true,
      kind: 'today',
    });
    expect(afterFive.done).toBe(1);
    expect(afterFive.counterText).toBe('1 из 5 дней');
    expect(afterFive.today).toMatchObject({ trips: 5, tripsLeft: 0, goalTaken: true, heatStep: 3 });

    await addTrips(driver.profileId, tashkent('2026-10-01 20:00'));

    const afterSix = await requireProgress(driver.personId, tashkent('2026-10-01 21:00'));

    expect(afterSix.days[0]?.trips).toBe(6);
    expect(afterSix.done).toBe(1);
  });

  it('поездки до вступления не зачитываются, даже за минуту до кнопки', async () => {
    const { campaignId, drivers } = await launch(1);
    const [driver] = drivers;

    if (!driver) throw new Error('нет водителя');

    const joinedAt = tashkent('2026-10-01 14:00');

    await joinAt(campaignId, driver.personId, joinedAt);
    await addTrips(driver.profileId, tashkent('2026-10-01 10:00'), 3);
    await addTrips(driver.profileId, new Date(joinedAt.getTime() - 60_000));
    await addTrips(driver.profileId, tashkent('2026-10-01 15:00'));
    // Незавершённый заказ после вступления в счёт не идёт тоже.
    await addTrips(driver.profileId, tashkent('2026-10-01 16:00'), 1, 'cancelled');

    const progress = await requireProgress(driver.personId, tashkent('2026-10-01 18:00'));

    expect(progress.days[0]?.trips).toBe(1);
    expect(progress.today?.goalText).toBe('Сундук дня ждёт: всего 4 поездки');
  });

  it('сутки режутся в 05:00 по Ташкенту, день окна переключается сам, пустые дни — нули', async () => {
    const { campaignId, drivers } = await launch(1);
    const [driver] = drivers;

    if (!driver) throw new Error('нет водителя');

    await joinAt(campaignId, driver.personId, tashkent('2026-10-01 09:00'));
    await addTrips(driver.profileId, tashkent('2026-10-03 04:59'));

    const beforeFive = await requireProgress(driver.personId, tashkent('2026-10-03 04:50'));

    expect(beforeFive.day).toBe(2);
    expect(beforeFive.days.map((day) => day.trips)).toEqual([0, 1, 0, 0, 0, 0, 0]);
    expect(beforeFive.days.map((day) => day.kind)).toEqual([
      'past',
      'today',
      'future',
      'future',
      'future',
      'future',
      'future',
    ]);

    await addTrips(driver.profileId, tashkent('2026-10-03 05:01'));

    const afterFive = await requireProgress(driver.personId, tashkent('2026-10-03 05:10'));

    expect(afterFive.day).toBe(3);
    expect(afterFive.days.map((day) => day.trips)).toEqual([0, 1, 1, 0, 0, 0, 0]);
    expect(afterFive.days.map((day) => day.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);
  });

  it('опоздавшая поездка дозачитывает вчерашний день', async () => {
    const { campaignId, drivers } = await launch(1);
    const [driver] = drivers;

    if (!driver) throw new Error('нет водителя');

    await joinAt(campaignId, driver.personId, tashkent('2026-10-01 09:00'));
    await addTrips(driver.profileId, tashkent('2026-10-01 12:00'), 4);

    const morning = tashkent('2026-10-02 08:00');

    expect((await requireProgress(driver.personId, morning)).days[0]?.qualified).toBe(false);

    // Пятая поездка вчерашнего дня доехала из Fleet API только утром.
    await addTrips(driver.profileId, tashkent('2026-10-02 04:30'));

    const progress = await requireProgress(driver.personId, morning);

    expect(progress.days[0]).toMatchObject({ trips: 5, qualified: true, kind: 'past' });
    expect(progress.done).toBe(1);
  });

  it('вступивший на пятый день сразу видит «уже не собрать»', async () => {
    const { campaignId, drivers } = await launch(1);
    const [driver] = drivers;

    if (!driver) throw new Error('нет водителя');

    await joinAt(campaignId, driver.personId, tashkent('2026-10-05 10:00'));

    const progress = await requireProgress(driver.personId, tashkent('2026-10-05 10:05'));

    expect(progress.slack).toBeLessThan(0);
    expect(progress.weekTop).toEqual({ text: 'ещё 3 дня с сундуками', tone: 'grey' });
    expect(progress.weekBottom).toEqual({ text: 'каждые 5 поездок — сундук', tone: 'grey' });
  });

  it('без вступления чисел прогресса нет вовсе', async () => {
    const { drivers } = await launch(1);
    const [driver] = drivers;

    if (!driver) throw new Error('нет водителя');

    // Первое чтение переводит в «открыл экран», второе читает уже открывшего.
    expect(await readProgress(driver.personId, tashkent('2026-10-02 10:00'))).toBeNull();
    expect(await readProgress(driver.personId, tashkent('2026-10-02 10:05'))).toBeNull();
  });

  it('итог окна: исходы по состояниям, снимок, повтор ничего не переписывает', async () => {
    const { campaignId, drivers } = await launch(6);
    const [silent, viewer, decliner, idle, returned, short] = drivers;

    if (!silent || !viewer || !decliner || !idle || !returned || !short) {
      throw new Error('нет водителей');
    }

    const inside = tashkent('2026-10-01 09:00');

    await readMemberCampaign(asDriver(viewer.personId), inside);
    await declineCampaign(asDriver(decliner.personId), inside);
    await joinAt(campaignId, idle.personId, inside);
    await joinAt(campaignId, returned.personId, inside);
    await joinAt(campaignId, short.personId, inside);

    for (const day of ['01', '02', '03', '05', '07']) {
      await addTrips(returned.profileId, tashkent(`2026-10-${day} 12:00`), 5);
    }

    for (const day of ['01', '02', '04', '06']) {
      await addTrips(short.profileId, tashkent(`2026-10-${day} 12:00`), 5);
    }

    await addTrips(short.profileId, tashkent('2026-10-07 12:00'), 3);

    // Буфер четыре часа после конца окна ещё не прошёл — итога нет.
    await settleCampaignOutcomes(new Date('2026-10-08T03:59:00Z'));
    expect((await readParticipantOutcomes(campaignId)).every((row) => row.outcome === null)).toBe(
      true,
    );

    const first = await settleCampaignOutcomes(tashkent('2026-10-08 09:00'));

    expect(first.settled).toBeGreaterThanOrEqual(6);

    const outcomes = new Map(
      (await readParticipantOutcomes(campaignId)).map((row) => [row.personId, row]),
    );

    expect(outcomes.get(silent.personId)?.outcome).toBe('no_response');
    expect(outcomes.get(viewer.personId)?.outcome).toBe('seen_not_joined');
    expect(outcomes.get(decliner.personId)?.outcome).toBe('seen_not_joined');
    expect(outcomes.get(idle.personId)).toMatchObject({
      outcome: 'joined_no_trips',
      qualifiedDays: 0,
      dayTrips: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(outcomes.get(returned.personId)).toMatchObject({
      outcome: 'returned',
      qualifiedDays: 5,
      dayTrips: [5, 5, 5, 0, 5, 0, 5],
    });
    expect(outcomes.get(short.personId)).toMatchObject({
      outcome: 'short',
      qualifiedDays: 4,
      dayTrips: [5, 5, 0, 5, 0, 5, 3],
    });

    // Сообщение об итоге — каждому, чей исход записан этим прогоном: вступившему с неоткрытыми
    // сундуками — их число, не вступившему — коротко (issue #182).
    const finishedNotices = new Map(
      first.notifications.map((notification) => [notification.personId, notification]),
    );

    expect(finishedNotices.get(returned.personId)).toMatchObject({
      template: 'campaign_finished',
      params: { outcome: 'returned', qualifiedDays: 5, unopenedChests: 7 },
    });
    expect(finishedNotices.get(short.personId)).toMatchObject({
      params: { outcome: 'short', unopenedChests: 5 },
    });
    expect(finishedNotices.get(idle.personId)).toMatchObject({
      params: { outcome: 'joined_no_trips', unopenedChests: 0 },
    });
    expect(finishedNotices.get(silent.personId)).toMatchObject({
      params: { outcome: 'no_response', unopenedChests: 0 },
    });

    // Исход у всех, но сундуки не открыты — акция идёт до вскрытия в 21:00: окончи её итог,
    // экран вступивших погас бы за полдня до вскрытия.
    expect((await readCampaign(campaignId)).campaign.status).toBe('running');

    // Не вступивший после конца окна акцию не видит, вступивший — видит до вскрытия.
    const afterWindow = tashkent('2026-10-08 10:00');

    expect((await readMemberCampaign(asDriver(silent.personId), afterWindow)).campaign).toBeNull();
    expect((await readMemberCampaign(asDriver(returned.personId), afterWindow)).campaign).not.toBeNull();

    await revealCampaignChests(tashkent('2026-10-08 21:00'));

    // Сундуки вскрыты — акция окончена.
    const card = await readCampaign(campaignId);

    expect(card.campaign.status).toBe('finished');
    expect(card.breakdown).toEqual([
      expect.objectContaining({
        half: 'a',
        total: 6,
        outcomes: {
          returned: 1,
          short: 1,
          joined_no_trips: 1,
          seen_not_joined: 2,
          no_response: 1,
        },
      }),
    ]);

    // Поездка, доехавшая после итога, ни исхода, ни снимка не меняет.
    await addTrips(short.profileId, tashkent('2026-10-07 20:00'), 2);

    const second = await settleCampaignOutcomes(tashkent('2026-10-08 12:00'));
    const after = new Map(
      (await readParticipantOutcomes(campaignId)).map((row) => [row.personId, row]),
    );

    expect(second.settled).toBe(0);
    expect(second.notifications.filter((job) => finishedNotices.has(job.personId))).toEqual([]);
    expect(after.get(short.personId)).toEqual(outcomes.get(short.personId));
    expect(after.get(returned.personId)).toEqual(outcomes.get(returned.personId));

    // Таблица участников: фильтр по исходу и порядок по зачётным дням.
    const shortOnly = await readCampaignParticipants(
      campaignId,
      { half: null, state: null, outcome: 'short' },
      'name',
      25,
      0,
    );

    expect(shortOnly.rows.map((row) => row.personId)).toEqual([short.personId]);
    expect(shortOnly.rows[0]).toMatchObject({ outcome: 'short', qualifiedDays: 4 });

    const byDays = await readCampaignParticipants(
      campaignId,
      { half: null, state: null, outcome: null },
      'qualified_days',
      25,
      0,
    );

    expect(byDays.rows.slice(0, 2).map((row) => row.personId)).toEqual([
      returned.personId,
      short.personId,
    ]);
  });

  it('пока окно идёт, исходов нет; половина Б без своего окна держит акцию идущей', async () => {
    const { campaignId, drivers } = await launch(4, true);
    const halfA = await readCampaignParticipants(
      campaignId,
      { half: 'a', state: null, outcome: null },
      'name',
      25,
      0,
    );
    const [joinedPersonId, silentPersonId] = halfA.rows.map((row) => row.personId);
    const joined = drivers.find((driver) => driver.personId === joinedPersonId);

    if (!joined || !silentPersonId) throw new Error('нет водителей половины А');

    await joinAt(campaignId, joined.personId, tashkent('2026-10-01 09:00'));
    await addTrips(joined.profileId, tashkent('2026-10-02 12:00'), 5);
    await addTrips(joined.profileId, tashkent('2026-10-07 12:00'), 2);

    const page = await readCampaignParticipants(
      campaignId,
      { half: null, state: null, outcome: null },
      'outcome_at',
      25,
      0,
    );

    expect(page.rows).toHaveLength(drivers.length);
    expect(page.rows.every((row) => row.outcome === null && row.qualifiedDays === null)).toBe(true);

    await settleCampaignOutcomes(tashkent('2026-10-08 09:00'));

    const card = await readCampaign(campaignId);

    expect(card.campaign.status).toBe('running');

    const byHalf = new Map(card.breakdown.map((row) => [row.half, row]));

    expect(byHalf.get('a')?.outcomes).toMatchObject({ short: 1, no_response: 1 });
    expect(byHalf.get('b')?.outcomes).toEqual({
      returned: 0,
      short: 0,
      joined_no_trips: 0,
      seen_not_joined: 0,
      no_response: 0,
    });

    // Служба, получив проставленный исход, рисует неделю из снимка и журнал не читает, сколько
    // бы поездок ни доехало. Вступивший видит акцию после конца окна до вскрытия (issue #182).
    const inside = tashkent('2026-10-08 10:00');
    const frozen = await requireProgress(joined.personId, inside);

    expect(frozen).toMatchObject({
      frozen: true,
      outcome: 'short',
      day: 7,
      done: 1,
      today: null,
      weekTop: null,
      weekBottom: null,
    });
    expect(frozen.days.map((day) => day.trips)).toEqual([0, 5, 0, 0, 0, 0, 2]);
    expect(frozen.days.every((day) => day.kind === 'past')).toBe(true);

    await addTrips(joined.profileId, tashkent('2026-10-07 20:00'), 3);

    expect(await requireProgress(joined.personId, inside)).toEqual(frozen);
  });
});
