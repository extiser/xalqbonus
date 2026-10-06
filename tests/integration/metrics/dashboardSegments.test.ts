import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { createLeadersSegment } from '#server/services/metrics/createLeadersSegment';
import { createNewcomersSegment } from '#server/services/metrics/createNewcomersSegment';
import { DashboardSegmentEmptyError } from '#server/services/metrics/dashboardSegment';
import { LeadersListError } from '#server/services/metrics/listLeadersExport';
import { readLeaders } from '#server/services/metrics/readLeaders';
import { readNewcomers } from '#server/services/metrics/readNewcomers';
import { readSegmentPersonIds } from '#server/services/segments/readSegmentPersonIds';
import { shiftDayKey } from '#server/utils/parkTime';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import type { Segment } from '#shared/types/segment';
import { cleanupTestData, createTestPerson, disconnectDatabase, type TestPerson } from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import {
  cleanupTestLinks,
  cleanupTestMetrics,
  closeTestHistoryDays,
  insertTestPersonDays,
  linkTestPersonAt,
  type TestPersonDay,
} from '../support/metrics';
import { cleanupTestSegments, trackTestSegment } from '../support/segments';

/**
 * «Сделать сегмент» у списков дашборда против настоящей базы (issue #415): лидеры на «Рычагах»
 * и новички на «Глубине».
 *
 * Люди сегмента ложатся сырым `INSERT … SELECT unnest(…)` (`personIdsSql`) — третье исключение
 * правила тестов (docs/infra.md → «Тесты»). Тест гоняет его через сервисы — тем путём, которым
 * его зовут ручки.
 *
 * Данные — опорных сценариев `leaders.test.ts` и `newcomers.test.ts`, урезанные до того, что
 * нужно списку. Таблица метрик производная и стирается целиком, поэтому у лидеров и новичков
 * свои блоки со своей уборкой: люди одного сценария в другой не попадают. В программе — тот,
 * у кого привязка Telegram открыта сейчас.
 */

const listedPersonIds = async (segmentId: string): Promise<string[]> => {
  const rows = await db.segmentMember.findMany({ where: { segmentId }, select: { personId: true } });

  return rows.map((row) => row.personId).sort();
};

const countSegmentsBy = (employeeId: string): Promise<number> =>
  db.segment.count({ where: { createdById: employeeId } });

const tracked = (segment: Segment): Segment => {
  trackTestSegment(segment.segmentId);

  return segment;
};

const sorted = (personIds: string[]): string[] => [...personIds].sort();

/** Среды недель с понедельника `from` по понедельник `to` включительно. */
const wednesdays = (from: string, to: string): string[] => {
  const days: string[] = [];

  for (let monday = from; monday <= to; monday = shiftDayKey(monday, 7)) {
    days.push(shiftDayKey(monday, 2));
  }

  return days;
};

/** 05.03.2027, 17:00 по Ташкенту: закрыт февраль 2027. */
const NOW = new Date('2027-03-05T12:00:00Z');

afterAll(async () => {
  await disconnectDatabase();
});

describe('сегмент из списка лидеров', () => {
  type LeaderName = 'steady' | 'below' | 'stopped' | 'left' | 'noNorm';

  const people = {} as Record<LeaderName, TestPerson>;

  beforeAll(async () => {
    await cleanupTestMetrics([], []);

    for (const name of ['steady', 'below', 'stopped', 'left', 'noNorm'] as const) {
      people[name] = await createTestPerson({ inProgram: true });
    }

    const rows: TestPersonDay[] = [];
    const add = (person: TestPerson, days: readonly string[], trips: number): void => {
      for (const day of days) rows.push({ day, personId: person.personId, trips });
    };

    // Как в leaders.test.ts: лидеры января — шестеро из 26 на линии, в феврале — ездит меньше,
    // перестал и двое ушедших.
    add(people.steady, wednesdays('2026-11-02', '2027-02-22'), 20);
    add(people.below, wednesdays('2026-11-02', '2027-01-25'), 20);
    add(people.below, wednesdays('2027-02-01', '2027-02-22'), 5);
    add(people.stopped, wednesdays('2026-11-02', '2027-02-01'), 20);
    add(people.left, wednesdays('2026-11-02', '2027-01-25'), 20);
    add(people.noNorm, ['2027-01-06', '2027-01-13'], 60);

    for (let index = 0; index < 20; index += 1) {
      const filler = await createTestPerson({ inProgram: false });
      add(filler, ['2027-01-15'], 1);
    }

    for (let index = 0; index < 2; index += 1) {
      const filler = await createTestPerson({ inProgram: false });
      add(filler, ['2027-02-15'], 1);
    }

    await insertTestPersonDays(rows);

    // Привязка закрыта — в программе не считается.
    await linkTestPersonAt(people.stopped.personId, new Date('2026-10-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'));
  });

  afterAll(async () => {
    await cleanupTestLinks();
    await cleanupTestMetrics([], []);
    await cleanupTestData();
    await cleanupTestSegments();
    await cleanupTestEmployees();
  });

  // Порядок важен: пока открытых привязок нет, в списке нет участников программы.
  it('в списке нет участников программы — отказ, сегмента нет', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const list = (await readLeaders('2027-02', NOW)).dashboard.list;

    expect(list?.counted && list.rows.length).toBe(4);
    expect(list?.counted && list.rows.some((row) => row.inProgram)).toBe(false);

    await expect(createLeadersSegment('2027-02', employeeId, NOW)).rejects.toBeInstanceOf(DashboardSegmentEmptyError);
    expect(await countSegmentsBy(employeeId)).toBe(0);
  });

  it('список, который не строится, — тот же отказ, что у выгрузки', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });

    await expect(createLeadersSegment('2025-10', employeeId, NOW)).rejects.toBeInstanceOf(LeadersListError);
    await expect(createLeadersSegment('2026-05', employeeId, NOW)).rejects.toThrow('Список не строится');
    expect(await countSegmentsBy(employeeId)).toBe(0);
  });

  it('сегмент — ровно участники программы из строк списка, имя и описание по формату', async () => {
    await linkTestPersonAt(people.below.personId, new Date('2026-10-01T00:00:00Z'));
    await linkTestPersonAt(people.left.personId, new Date('2026-10-01T00:00:00Z'));

    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const list = (await readLeaders('2027-02', NOW)).dashboard.list;
    const members = list?.counted ? list.rows.filter((row) => row.inProgram).map((row) => row.personId) : [];

    expect(sorted(members)).toEqual(sorted([people.below.personId, people.left.personId]));

    const segment = tracked(await createLeadersSegment('2027-02', employeeId, NOW));

    expect(segment).toMatchObject({
      kind: 'list',
      isDemo: false,
      conditions: EMPTY_SEGMENT_CONDITIONS,
      archivedAt: null,
      name: 'Лидеры января 2027: ездят меньше обычного, перестали, ушли — на 05.03.2027',
      description:
        'Дашборд → Рычаги, список „Ездят меньше обычного, перестали, ушли“ за февраль 2027. ' +
        'Лидеры января 2027 — верхние 20 % водителей по поездкам. ' +
        'Ездят меньше обычного — 3 недели подряд ниже нормы на 30 % и больше; норма — медиана поездок в неделю за 8 недель. ' +
        'Состояние — на неделю 22.02.2027–28.02.2027. ' +
        'Вошло 2 из 4 строк списка, остальные 2 не участники программы: бот им написать не может. ' +
        'Собран 05.03.2027 в 17:00 по Ташкенту. Состав зафиксирован и не пересчитывается.',
    });
    expect(await listedPersonIds(segment.segmentId)).toEqual(sorted(members));
    expect(sorted(await readSegmentPersonIds(segment.segmentId))).toEqual(sorted(members));
  });
});

describe('сегмент из списка новичков', () => {
  type NewcomerName = 'janQuit' | 'febReached' | 'febBelow' | 'febFew' | 'febFewer';

  const people = {} as Record<NewcomerName, TestPerson>;
  let historyDays: string[] = [];

  beforeAll(async () => {
    await cleanupTestMetrics([], []);
    // Новичку нужна вся история: порции сбора до живой синхронизации — закрытыми.
    historyDays = await closeTestHistoryDays('2025-09-30', '2026-09-20');

    for (const name of ['janQuit', 'febReached', 'febBelow', 'febFew', 'febFewer'] as const) {
      people[name] = await createTestPerson({ inProgram: false });
    }

    const rows: TestPersonDay[] = [];
    const add = (name: NewcomerName, day: string, trips: number): void => {
      rows.push({ day, personId: people[name].personId, trips });
    };

    // Январь: один новичок, 14 дней прошли, поездок меньше 20, не в программе.
    add('janQuit', '2027-01-10', 4);
    // Февраль: 20+ — не в списке; трое меньше 20, в программе — один.
    add('febReached', '2027-02-02', 22);
    add('febBelow', '2027-02-03', 3);
    add('febFew', '2027-02-01', 2);
    add('febFewer', '2027-02-02', 1);

    await insertTestPersonDays(rows);
    await linkTestPersonAt(people.febBelow.personId, new Date('2027-02-04T00:00:00Z'));
  });

  afterAll(async () => {
    await cleanupTestLinks();
    await cleanupTestMetrics([], historyDays);
    await cleanupTestData();
    await cleanupTestSegments();
    await cleanupTestEmployees();
  });

  it('в списке нет участников программы — отказ, сегмента нет', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const list = (await readNewcomers('2027-01', NOW)).dashboard.list;

    expect(list?.counted && list.rows.map((row) => row.personId)).toEqual([people.janQuit.personId]);

    await expect(createNewcomersSegment('2027-01', employeeId, NOW)).rejects.toBeInstanceOf(DashboardSegmentEmptyError);
    expect(await countSegmentsBy(employeeId)).toBe(0);
  });

  it('сегмент — ровно участники программы из строк списка, имя и описание по формату', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const list = (await readNewcomers('2027-02', NOW)).dashboard.list;
    const members = list?.counted ? list.rows.filter((row) => row.inProgram).map((row) => row.personId) : [];

    expect(list?.counted && list.rows.length).toBe(3);
    expect(members).toEqual([people.febBelow.personId]);

    const segment = tracked(await createNewcomersSegment('2027-02', employeeId, NOW));

    expect(segment).toMatchObject({
      kind: 'list',
      isDemo: false,
      conditions: EMPTY_SEGMENT_CONDITIONS,
      name: 'Новички февраля 2027: меньше 20 поездок за 14 дней — на 05.03.2027',
      description:
        'Дашборд → Глубина, список „Новички февраля 2027: меньше 20 поездок за 14 дней“. ' +
        'Новичок — первая завершённая поездка в истории парка пришлась на февраль 2027; 14 дней — день первой поездки и 13 следующих. ' +
        'На 28.02.2027. ' +
        'Вошло 1 из 3 строк списка, остальные 2 не участники программы: бот им написать не может. ' +
        'Собран 05.03.2027 в 17:00 по Ташкенту. Состав зафиксирован и не пересчитывается.',
    });
    expect(await listedPersonIds(segment.segmentId)).toEqual(members);
    expect(await readSegmentPersonIds(segment.segmentId)).toEqual(members);
  });
});
