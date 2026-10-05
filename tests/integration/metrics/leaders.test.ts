import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listLeadersExport } from '#server/services/metrics/listLeadersExport';
import { readLeaders, type LeadersReport } from '#server/services/metrics/readLeaders';
import { shiftDayKey } from '#server/utils/parkTime';
import type { DashboardLeaderRow } from '#shared/types/dashboard';
import type { ReportCell } from '#shared/types/reports';
import {
  cleanupTestData,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
  reassignProfileToPerson,
  type TestPerson,
} from '../support/database';
import {
  addTestProfilePhone,
  cleanupTestLinks,
  cleanupTestMetrics,
  insertTestPersonDays,
  linkTestPersonAt,
  setTestProfileCard,
  type TestPersonDay,
} from '../support/metrics';

/**
 * Лидеры по поездкам и список тех, кого парк может потерять, против настоящей базы (issue #402).
 *
 * Запросы сырые — третье исключение правила тестов (docs/infra.md → «Тесты»). Таблица метрик
 * целиком производная: фикстура пишется в неё напрямую, перед сценарием она стирается — лидеры
 * считаются по всем людям в ней. Месяцы — с 2026-11: сутки после `TRIPS_COMPLETE_FROM` покрыты
 * без журнала сбора истории.
 *
 * Поездки — по средам, одной строкой на неделю. Люди фикстуры:
 *
 * - `steady` — 20 в неделю с ноября 2026 по февраль 2027: в списке его нет
 * - `below` — 20 в неделю по январь, в феврале по 5: ездит меньше, 4 недели ниже нормы 20
 * - `stopped` — 20 в неделю по первую неделю февраля, дальше ни одной: перестал, 3 недели
 * - `left` — 20 в неделю по январь, в феврале ни одной, в марте снова 7: ушёл, норма до остановки 20
 * - `noNorm` — 60 в неделю две недели января и больше ничего: ушёл, нормы нет
 * - 20 человек по одной поездке в январе — чтобы на линии было 25, а лидеров 5
 */

const WEEKLY = 20;

/** Среды недель с понедельника `from` по понедельник `to` включительно. */
const wednesdays = (from: string, to: string): string[] => {
  const days: string[] = [];

  for (let monday = from; monday <= to; monday = shiftDayKey(monday, 7)) {
    days.push(shiftDayKey(monday, 2));
  }

  return days;
};

const NOVEMBER_FIRST_MONDAY = '2026-11-02';

describe('лидеры по поездкам', () => {
  const people: Record<'steady' | 'below' | 'stopped' | 'left' | 'noNorm', TestPerson> = {} as Record<
    'steady' | 'below' | 'stopped' | 'left' | 'noNorm',
    TestPerson
  >;
  let closed: LeadersReport;

  beforeAll(async () => {
    await cleanupTestMetrics([], []);

    for (const name of ['steady', 'below', 'stopped', 'left', 'noNorm'] as const) {
      people[name] = await createTestPerson({ inProgram: true });
    }

    const rows: TestPersonDay[] = [];
    const add = (person: TestPerson, days: readonly string[], trips: number): void => {
      for (const day of days) rows.push({ day, personId: person.personId, trips });
    };

    add(people.steady, wednesdays(NOVEMBER_FIRST_MONDAY, '2027-02-22'), WEEKLY);
    add(people.below, wednesdays(NOVEMBER_FIRST_MONDAY, '2027-01-25'), WEEKLY);
    add(people.below, wednesdays('2027-02-01', '2027-02-22'), 5);
    add(people.stopped, wednesdays(NOVEMBER_FIRST_MONDAY, '2027-02-01'), WEEKLY);
    add(people.left, wednesdays(NOVEMBER_FIRST_MONDAY, '2027-01-25'), WEEKLY);
    add(people.left, ['2027-03-03'], 7);
    add(people.noNorm, ['2027-01-06', '2027-01-13'], 60);

    for (let index = 0; index < 20; index += 1) {
      const filler = await createTestPerson({ inProgram: false });
      add(filler, ['2027-01-15'], 1);
    }

    await insertTestPersonDays(rows);

    // Карточка «ездит меньше»: последняя поездка — на втором профиле, он и даёт позывной и ФИО.
    const donor = await createTestPerson({ inProgram: false });
    await reassignProfileToPerson(donor.profileId, people.below.personId);
    await setTestProfileCard(people.below.profileId, { callsign: 'T402-OLD', firstName: 'Старый', lastName: 'Профиль' });
    await setTestProfileCard(donor.profileId, {
      callsign: 'T402-NEW',
      firstName: 'Азиз',
      lastName: 'Каримов',
      middleName: 'Бахтиёрович',
    });
    await createTestTrip({
      profileId: people.below.profileId,
      tripOrderId: `test-leaders-${randomUUID()}`,
      status: 'complete',
      endedAt: new Date('2027-02-17T06:00:00Z'),
    });
    await createTestTrip({
      profileId: donor.profileId,
      tripOrderId: `test-leaders-${randomUUID()}`,
      status: 'complete',
      endedAt: new Date('2027-02-24T06:00:00Z'),
    });
    await addTestProfilePhone(people.below.profileId, { phoneRaw: '+998901110001', phoneE164: '+998901110001' });
    await addTestProfilePhone(donor.profileId, { phoneRaw: '90 111 00 02', phoneE164: null });

    // Программа — привязка, открытая сейчас: у «перестал» она закрыта.
    await linkTestPersonAt(people.below.personId, new Date('2026-10-01T00:00:00Z'));
    await linkTestPersonAt(people.stopped.personId, new Date('2026-10-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'));

    // Закрытый февраль 2027: лидеры января, опорный день 28.02, неделя 22–28.02.
    closed = await readLeaders('2027-02', new Date('2027-03-05T12:00:00Z'));
  });

  afterAll(async () => {
    await cleanupTestLinks();
    await cleanupTestMetrics([], []);
    await cleanupTestData();
    await disconnectDatabase();
  });

  const rowOf = (report: LeadersReport, person: TestPerson): Omit<DashboardLeaderRow, 'personId'> | undefined => {
    const list = report.dashboard.list;
    const row = list?.counted ? list.rows.find((candidate) => candidate.personId === person.personId) : undefined;

    if (!row) return undefined;

    const { personId: _personId, ...rest } = row;

    return rest;
  };

  it('плитки: лидеры января, ездят меньше и перестали, ушли', () => {
    const { dashboard } = closed;

    expect(dashboard).toMatchObject({
      leadersMonth: '2027-01',
      cohortMonth: '2027-01',
      ongoing: false,
      asOfDay: '2027-02-28',
      week: { from: '2027-02-22', to: '2027-02-28' },
      noLeaders: false,
      leaders: { counted: true, leaders: 5, driversOnLine: 25, leaderTrips: 440, allTrips: 460 },
      slipping: { counted: true, below: 1, stopped: 1 },
      left: { counted: true, left: 2, leaders: 5, trips: 200 },
    });
  });

  it('группы и порядок: ездят меньше, перестали, ушли — недавние сверху', () => {
    const list = closed.dashboard.list;
    const order = list?.counted ? list.rows.map((row) => row.personId) : [];

    expect(order).toEqual([
      people.below.personId,
      people.stopped.personId,
      people.left.personId,
      people.noNorm.personId,
    ]);
  });

  it('строка «ездит меньше» — неделя, норма, отклонение, серия и карточка с последней поездки', () => {
    expect(rowOf(closed, people.below)).toEqual({
      group: 'below',
      callsign: 'T402-NEW',
      name: 'Каримов Азиз Бахтиёрович',
      inProgram: true,
      weekTrips: 5,
      norm: 20,
      deviationPercent: -75,
      idleDays: null,
      weeksBelow: 4,
      lastTripDay: '2027-02-24',
    });
    expect(closed.contacts.get(people.below.personId)).toEqual({
      lastName: 'Каримов',
      firstName: 'Азиз',
      middleName: 'Бахтиёрович',
      phones: '+998901110001, 90 111 00 02',
    });
  });

  it('строка «перестал» — ноль, норма, не ездит N дней; закрытая привязка — не в программе', () => {
    expect(rowOf(closed, people.stopped)).toMatchObject({
      group: 'stopped',
      inProgram: false,
      weekTrips: 0,
      norm: 20,
      deviationPercent: null,
      idleDays: 25,
      weeksBelow: 3,
      lastTripDay: '2027-02-03',
    });
  });

  it('строки «ушли» — норма до остановки, без серии; меньше 4 недель с поездками — нормы нет', () => {
    expect(rowOf(closed, people.left)).toMatchObject({
      group: 'left',
      weekTrips: 0,
      norm: 20,
      idleDays: 32,
      weeksBelow: null,
      lastTripDay: '2027-01-27',
    });
    expect(rowOf(closed, people.noNorm)).toMatchObject({
      group: 'left',
      norm: null,
      idleDays: 46,
      lastTripDay: '2027-01-13',
    });
  });

  it('идущий месяц: «ушли» — лидеры позапрошлого, строка — факт на вчера', async () => {
    // Идёт март 2027, вчера 08.03: лидеры февраля, когорта — январь без поездок в феврале.
    const ongoing = await readLeaders('2027-03', new Date('2027-03-09T12:00:00Z'));

    expect(ongoing.dashboard).toMatchObject({
      leadersMonth: '2027-02',
      cohortMonth: '2027-01',
      ongoing: true,
      asOfDay: '2027-03-08',
      week: { from: '2027-03-01', to: '2027-03-07' },
      left: { counted: true, left: 2, leaders: 5 },
    });
    // Вернулся в марте: настоящая последняя поездка и поездки за неделю, норма — до остановки.
    expect(rowOf(ongoing, people.left)).toMatchObject({
      group: 'left',
      weekTrips: 7,
      norm: 20,
      idleDays: 5,
      lastTripDay: '2027-03-03',
    });
  });

  it('октябрь 2025 — лидеров нет', async () => {
    const report = await readLeaders('2025-10', new Date('2027-03-05T12:00:00Z'));

    expect(report.dashboard).toMatchObject({ noLeaders: true, leaders: null, slipping: null, left: null, list: null });
  });

  it('несобранные сутки — не считаем, список не строится, выгрузка отказывает', async () => {
    const now = new Date('2027-03-05T12:00:00Z');
    const report = await readLeaders('2026-05', now);

    expect(report.dashboard.leaders?.counted).toBe(false);
    expect(report.dashboard.list?.counted).toBe(false);
    await expect(listLeadersExport('2026-05', now)).rejects.toThrow('Список не строится');
  });

  it('выгрузка — те же строки в том же порядке, колонки по списку', async () => {
    const report = await listLeadersExport('2027-02', new Date('2027-03-05T12:00:00Z'));
    const section = report.sections[0];
    const cells: Record<string, ReportCell>[] = section?.rows.map((row) => row.cells) ?? [];

    expect(section?.columns.map((column) => column.label)).toEqual([
      'Позывной',
      'Фамилия',
      'Имя',
      'Отчество',
      'Телефон',
      'Участник программы',
      'Группа',
      'Поездок за неделю',
      'Норма',
      'К норме, %',
      'Не ездит, дней',
      'Недель ниже',
      'Последняя поездка',
    ]);
    expect(cells.map((row) => row.group)).toEqual(['ездит меньше', 'перестал', 'ушёл', 'ушёл']);
    expect(cells[0]).toEqual({
      callsign: 'T402-NEW',
      lastName: 'Каримов',
      firstName: 'Азиз',
      middleName: 'Бахтиёрович',
      phones: '+998901110001, 90 111 00 02',
      inProgram: 'да',
      group: 'ездит меньше',
      weekTrips: 5,
      norm: 20,
      deviationPercent: -75,
      idleDays: null,
      weeksBelow: 4,
      lastTripDay: '24.02.2027',
    });
    expect(cells[3]).toMatchObject({ norm: null, deviationPercent: null, idleDays: 46, weeksBelow: null });
    expect(report.subtitle).toBe('Лидеры января 2027 · последняя полная неделя 22.02.2027–28.02.2027');
  });
});
