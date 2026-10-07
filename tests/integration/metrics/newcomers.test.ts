import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listNewcomersExport, newcomersFileName } from '#server/services/metrics/listNewcomersExport';
import { readNewcomers, type NewcomersReport } from '#server/services/metrics/readNewcomers';
import type { ReportCell } from '#shared/types/reports';
import {
  cleanupTestData,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
  type TestPerson,
} from '../support/database';
import {
  addTestProfilePhone,
  cleanupTestLinks,
  cleanupTestMetrics,
  closeTestHistoryDays,
  insertTestPersonDays,
  insertTestPersonPrior,
  linkTestPersonAt,
  setTestProfileCard,
  upsertTestHistoryDay,
  type TestPersonDay,
} from '../support/metrics';

/**
 * Новички на «Глубине» против настоящей базы (issue #407).
 *
 * Запросы сырые — третье исключение правила тестов (docs/infra.md → «Тесты»). Таблица метрик
 * целиком производная: фикстура пишется в неё напрямую, перед сценарием она стирается — новички
 * считаются по всем людям в ней. Новичку нужна вся история: порции сбора с 30.09.2025 по 20.09.2026
 * заводятся закрытыми, дальше сутки покрыты живой синхронизацией (`TRIPS_COMPLETE_FROM`).
 *
 * Люди фикстуры, выбран закрытый февраль 2027 (D = 28.02, R = февраль):
 *
 * - `veteran` — первая поездка в декабре 2026: новичок декабря, а не января и февраля; ездит
 *   в январе и феврале
 * - `janRider` — новичок января, 25 поездок за окно, ездит и в феврале
 * - `janQuit` — новичок января, 4 поездки, в феврале не ездит
 * - `febReached` — новичок февраля, 22 поездки за окно 02–15.02 и ещё 5 после него: 20+
 * - `febBelow` — новичок февраля, 3 поездки за окно 03–16.02 и 30 после него: меньше 20,
 *   в программе, карточка и телефон
 * - `febFew` — новичок февраля, 2 поездки 01.02 и больше ничего: меньше 20, первый в списке
 * - `febRunning` — новичок февраля с 20.02: окно кончается 05.03, на 28.02 ещё идёт
 * - `marchNew` — новичок марта с 01.03: в идущем марте первые итоги 14.03
 * - `priorJan` и `priorFeb` — первые сутки в таблице в январе и феврале, но ездили до истории
 *   заказов (issue #429): новичками не бывают нигде; без этого priorJan ездил бы и в феврале,
 *   а priorFeb с двумя поездками попал бы в список
 */

const HISTORY_FROM = '2025-09-30';
const HISTORY_TO = '2026-09-20';
const CLOSED_FEBRUARY_NOW = new Date('2027-03-05T12:00:00Z');

type PersonName =
  | 'veteran'
  | 'janRider'
  | 'janQuit'
  | 'febReached'
  | 'febBelow'
  | 'febFew'
  | 'febRunning'
  | 'marchNew'
  | 'priorJan'
  | 'priorFeb';

const PERSON_NAMES: readonly PersonName[] = [
  'veteran',
  'janRider',
  'janQuit',
  'febReached',
  'febBelow',
  'febFew',
  'febRunning',
  'marchNew',
  'priorJan',
  'priorFeb',
];

describe('новички на «Глубине»', () => {
  const people = {} as Record<PersonName, TestPerson>;
  let historyDays: string[] = [];
  let closed: NewcomersReport;

  beforeAll(async () => {
    await cleanupTestMetrics([], []);
    historyDays = await closeTestHistoryDays(HISTORY_FROM, HISTORY_TO);

    for (const name of PERSON_NAMES) {
      people[name] = await createTestPerson({ inProgram: false });
    }

    const rows: TestPersonDay[] = [];
    const add = (name: PersonName, day: string, trips: number): void => {
      rows.push({ day, personId: people[name].personId, trips });
    };

    add('veteran', '2026-12-10', 8);
    add('veteran', '2027-01-15', 8);
    add('veteran', '2027-02-15', 8);
    add('janRider', '2027-01-05', 25);
    add('janRider', '2027-02-10', 6);
    add('janQuit', '2027-01-20', 4);
    add('febReached', '2027-02-02', 10);
    add('febReached', '2027-02-15', 12);
    add('febReached', '2027-02-16', 5);
    add('febBelow', '2027-02-03', 3);
    add('febBelow', '2027-02-20', 30);
    add('febFew', '2027-02-01', 2);
    add('febRunning', '2027-02-20', 7);
    add('marchNew', '2027-03-01', 4);
    add('priorJan', '2027-01-10', 4);
    add('priorJan', '2027-02-10', 4);
    add('priorFeb', '2027-02-04', 2);

    await insertTestPersonDays(rows);
    await insertTestPersonPrior([
      { personId: people.priorJan.personId, lastDay: '2025-08-20' },
      { personId: people.priorFeb.personId, lastDay: '2024-05-03' },
    ]);

    // Карточка строки — профиль с последней поездкой не позже D; программа — открытая привязка.
    await setTestProfileCard(people.febBelow.profileId, {
      callsign: 'T407-1',
      firstName: 'Нодир',
      lastName: 'Комилов',
      middleName: 'Ботирович',
    });
    await createTestTrip({
      profileId: people.febBelow.profileId,
      tripOrderId: `test-newcomers-${randomUUID()}`,
      status: 'complete',
      endedAt: new Date('2027-02-20T06:00:00Z'),
    });
    await addTestProfilePhone(people.febBelow.profileId, { phoneRaw: '+998901234567', phoneE164: '+998901234567' });
    await linkTestPersonAt(people.febBelow.personId, new Date('2027-02-04T00:00:00Z'));

    closed = await readNewcomers('2027-02', CLOSED_FEBRUARY_NOW);
  });

  afterAll(async () => {
    await cleanupTestLinks();
    await cleanupTestMetrics([], historyDays);
    await cleanupTestData();
    await disconnectDatabase();
  });

  it('закрытый месяц: опорный день — его конец, кривая — по нему же', () => {
    expect(closed.dashboard.thresholds).toEqual({ firstDays: 14, tripsTarget: 20 });
    expect(closed.dashboard).toMatchObject({
      ongoing: false,
      asOfDay: '2027-02-28',
      curveMonth: '2027-02',
      firstCohortMonth: '2025-11',
      noNewcomers: false,
    });
  });

  it('«Сколько остаётся»: новички января в феврале и кривая взвешенно по наборам', () => {
    // +1: декабрь в январе (1 из 1) и январь в феврале (1 из 2) — 2 из 3; +2: декабрь в феврале.
    expect(closed.dashboard.retention).toEqual({
      counted: true,
      newcomers: 2,
      riding: 1,
      curve: [
        { offset: 1, riding: 2, newcomers: 3 },
        { offset: 2, riding: 1, newcomers: 1 },
      ],
      curveFromMonth: '2026-02',
    });
  });

  it('«Первые 14 дней»: прошедшие окна, 20+ и меньше, идущие; январь на тот же день', () => {
    expect(closed.dashboard.firstDays).toEqual({
      counted: true,
      newcomers: 4,
      reached: 1,
      below: 2,
      running: 1,
      firstResultsDay: null,
      previous: { passed: 2, reached: 1 },
    });
  });

  it('список: меньше 20 за окно, по поездкам, карточка с последней поездки', () => {
    const list = closed.dashboard.list;
    const rows = list?.counted ? list.rows : [];

    expect(rows.map((row) => row.personId)).toEqual([people.febFew.personId, people.febBelow.personId]);
    expect(rows[1]).toEqual({
      personId: people.febBelow.personId,
      callsign: 'T407-1',
      name: 'Комилов Нодир Ботирович',
      inProgram: true,
      firstTripDay: '2027-02-03',
      windowTrips: 3,
      lastTripDay: '2027-02-20',
    });
    expect(rows[0]).toMatchObject({ inProgram: false, windowTrips: 2, firstTripDay: '2027-02-01', lastTripDay: '2027-02-01' });
    expect(closed.contacts.get(people.febBelow.personId)).toEqual({
      lastName: 'Комилов',
      firstName: 'Нодир',
      middleName: 'Ботирович',
      phones: '+998901234567',
    });
  });

  it('ездил до истории заказов — ни в наборе, ни в окнах, ни в списке', () => {
    const list = closed.dashboard.list;
    const listed = list?.counted ? list.rows.map((row) => row.personId) : [];

    expect(listed).not.toContain(people.priorFeb.personId);
    expect(listed).not.toContain(people.priorJan.personId);
    // Набор января — janRider и janQuit; февраля — четверо без priorFeb.
    expect(closed.dashboard.retention).toMatchObject({ counted: true, newcomers: 2, riding: 1 });
    expect(closed.dashboard.firstDays).toMatchObject({ counted: true, newcomers: 4, previous: { passed: 2, reached: 1 } });
  });

  it('идущий месяц: кривая — по последнему закрытому, окна марта ещё не прошли', async () => {
    const ongoing = await readNewcomers('2027-03', new Date('2027-03-03T12:00:00Z'));

    expect(ongoing.dashboard).toMatchObject({
      ongoing: true,
      asOfDay: '2027-03-02',
      curveMonth: '2027-02',
      retention: { counted: true, newcomers: 2, riding: 1 },
      // febRunning на 02.03 ещё в окне: в сравнении только прошедшие.
      firstDays: {
        counted: true,
        newcomers: 1,
        reached: 0,
        below: 0,
        running: 1,
        firstResultsDay: '2027-03-14',
        previous: { passed: 3, reached: 1 },
      },
      list: { counted: true, rows: [] },
    });
    await expect(listNewcomersExport('2027-03', new Date('2027-03-03T12:00:00Z'))).rejects.toThrow(
      'Список — с 14 марта: у новичков марта 14 дней ещё не прошли.',
    );
  });

  it('октябрь 2025 — новичков нет; ноябрь 2025 — «через месяц» не по кому, сравнения нет', async () => {
    const october = await readNewcomers('2025-10', CLOSED_FEBRUARY_NOW);
    const november = await readNewcomers('2025-11', CLOSED_FEBRUARY_NOW);

    expect(october.dashboard).toMatchObject({ noNewcomers: true, retention: null, firstDays: null, list: null });
    expect(november.dashboard).toMatchObject({
      noNewcomers: false,
      retention: null,
      firstDays: { counted: true, newcomers: 0, previous: null },
      list: { counted: true, rows: [] },
    });
    await expect(listNewcomersExport('2025-10', CLOSED_FEBRUARY_NOW)).rejects.toThrow('Новичков в октябре 2025 нет');
    await expect(listNewcomersExport('2025-11', CLOSED_FEBRUARY_NOW)).rejects.toThrow('Новичков в ноябре нет.');
  });

  it('несобранные сутки в истории — не считаем ни один элемент, выгрузка отказывает', async () => {
    await upsertTestHistoryDay('2026-03-10', false);

    try {
      const report = await readNewcomers('2027-02', CLOSED_FEBRUARY_NOW);
      const retention = report.dashboard.retention;
      const incomplete =
        retention && !retention.counted
          ? retention.coverage.filter((period) => period.coveredDays < period.days).map((period) => period.from.slice(0, 7))
          : [];

      expect(retention?.counted).toBe(false);
      expect(incomplete).toEqual(['2026-03']);
      expect(report.dashboard.firstDays?.counted).toBe(false);
      expect(report.dashboard.list?.counted).toBe(false);
      await expect(listNewcomersExport('2027-02', CLOSED_FEBRUARY_NOW)).rejects.toThrow('Список не строится');
    } finally {
      await upsertTestHistoryDay('2026-03-10', true);
    }
  });

  it('выгрузка — те же строки в том же порядке, колонки по списку', async () => {
    const report = await listNewcomersExport('2027-02', CLOSED_FEBRUARY_NOW);
    const section = report.sections[0];
    const cells: Record<string, ReportCell>[] = section?.rows.map((row) => row.cells) ?? [];

    expect(section?.columns.map((column) => column.label)).toEqual([
      'Позывной',
      'Фамилия',
      'Имя',
      'Отчество',
      'Телефон',
      'Участник программы',
      'Первая поездка',
      'Поездок за 14 дней',
      'Последняя поездка',
    ]);
    expect(cells).toHaveLength(2);
    expect(cells[1]).toEqual({
      callsign: 'T407-1',
      lastName: 'Комилов',
      firstName: 'Нодир',
      middleName: 'Ботирович',
      phones: '+998901234567',
      inProgram: 'да',
      firstTripDay: '03.02.2027',
      windowTrips: 3,
      lastTripDay: '20.02.2027',
    });
    expect(cells[0]).toMatchObject({ inProgram: 'нет', windowTrips: 2 });
    expect(newcomersFileName('2027-02', CLOSED_FEBRUARY_NOW)).toBe(
      'Новички — меньше 20 поездок за 14 дней — февраль 2027.xlsx',
    );
  });
});
