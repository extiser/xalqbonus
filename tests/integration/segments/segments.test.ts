import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { createSegment } from '#server/services/segments/createSegment';
import {
  previewSavedSegment,
  previewSegmentConditions,
} from '#server/services/segments/previewSegment';
import { readSegment, readSegmentList } from '#server/services/segments/readSegment';
import { readSegmentPersonIds } from '#server/services/segments/readSegmentPersonIds';
import { setSegmentArchived } from '#server/services/segments/setSegmentArchived';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';
import { EMPTY_SEGMENT_CONDITIONS, SEGMENT_PREVIEW_LIMIT } from '#shared/segment';
import type { SegmentConditions } from '#shared/types/segment';
import {
  cleanupTestData,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
} from '../support/database';
import {
  cleanupTestEmployees,
  createTestEmployee,
  linkTestDriver,
  nextTestTelegramUserId,
} from '../support/employees';
import { grantPoints } from '../support/points';
import { cleanupTestSegments, trackTestSegment } from '../support/segments';

/**
 * Сегменты: список с числом состава, предпросмотр сохранённого и несохранённого, выдача
 * состава потребителю.
 *
 * Все запросы здесь сырые и читают шесть чужих таблиц — `persons`, `trips`, `park_profiles`,
 * `person_settings`, `telegram_links`, `accounts`, а список ещё и `employees`. Миграция
 * в любой из них ломает сегменты молча: типы расхождения со схемой не ловят (docs/infra.md →
 * «Тесты», третье исключение). Тест гоняет их через сервисы — тем путём, которым их зовут
 * ручки и потребитель.
 *
 * База тестов общая для всех файлов, и чужие люди в ней могут быть. Поэтому отбор сужается
 * балансом из окна, которого нет ни у кого, кроме людей этого файла, а проверки на отсутствие
 * идут по конкретным людям, а не по общему числу.
 */

/** Окно баланса, в которое попадают только люди этого файла. */
const BALANCE_FROM = 7_165_000;
const BALANCE_TO = 7_165_999;

const WINDOW: SegmentConditions = {
  ...EMPTY_SEGMENT_CONDITIONS,
  balanceMin: BALANCE_FROM,
  balanceMax: BALANCE_TO,
};

const DAY_MS = 24 * 60 * 60 * 1_000;

let tripSequence = 0;

type TestDriverInput = {
  /** Баланс водительского счёта. `null` — счёта нет вовсе. */
  balance: number | null;
  /** Сколько суток назад завершённая поездка. `null` — завершённых нет. */
  completedTripDaysAgo?: number | null;
  /** Отменённая поездка — она не делает человека «ездившим». */
  cancelledTripDaysAgo?: number | null;
  linked?: boolean;
};

/**
 * Водитель под сценарий. Баланс — настоящим переводом с эмиссионного счёта, а не правкой
 * `accounts`: инвариант журнала не должен расходиться после теста.
 *
 * Поездка ставится ровно на N×24 часа назад: перевода часов в Узбекистане нет, и сутки парка
 * между двумя такими моментами — ровно N, где бы ни стояла граница 05:00.
 */
const createDriver = async (input: TestDriverInput): Promise<string> => {
  const { personId, profileId } = await createTestPerson({ inProgram: true });

  if (input.balance !== null) {
    await grantPoints(personId, input.balance);
  }

  const trips: [number | null | undefined, string][] = [
    [input.completedTripDaysAgo, COMPLETED_TRIP_STATUS],
    [input.cancelledTripDaysAgo, 'cancelled'],
  ];

  for (const [daysAgo, status] of trips) {
    if (daysAgo === null || daysAgo === undefined) {
      continue;
    }

    tripSequence += 1;

    await createTestTrip({
      profileId,
      tripOrderId: `test-segment-trip-${personId}-${tripSequence}`,
      status,
      endedAt: new Date(Date.now() - daysAgo * DAY_MS),
    });
  }

  if (input.linked) {
    await linkTestDriver(personId, nextTestTelegramUserId());
  }

  return personId;
};

const createTestSegment = async (conditions: SegmentConditions): Promise<string> => {
  const { employeeId } = await createTestEmployee({ role: 'owner' });
  const segment = await createSegment(
    { name: 'Тестовый сегмент', description: null, conditions },
    employeeId,
    false,
  );

  trackTestSegment(segment.segmentId);

  return segment.segmentId;
};

describe('сегменты', () => {
  afterEach(async () => {
    // Сегмент ссылается на автора, привязки — на людей: сегменты первыми, люди последними.
    await cleanupTestSegments();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('список отдаёт сегмент с числом состава на сейчас', async () => {
    await createDriver({ balance: BALANCE_FROM + 1 });
    await createDriver({ balance: BALANCE_FROM + 2 });
    await createDriver({ balance: BALANCE_TO + 1 });

    const segmentId = await createTestSegment(WINDOW);
    const list = await readSegmentList();
    const listed = list.segments.find((segment) => segment.segmentId === segmentId);

    expect(listed).toEqual(
      expect.objectContaining({
        segmentId,
        name: 'Тестовый сегмент',
        description: null,
        conditions: WINDOW,
        createdByName: 'Тестовый Сотрудник',
        archivedAt: null,
        total: 2,
      }),
    );
    expect(Number.isNaN(Date.parse(list.calculatedAt))).toBe(false);
  });

  it('сохранённый и несохранённый предпросмотр и выдача потребителю дают одно число', async () => {
    const linkedId = await createDriver({
      balance: BALANCE_FROM + 10,
      completedTripDaysAgo: 30,
      linked: true,
    });
    await createDriver({ balance: BALANCE_FROM + 11 });

    const segmentId = await createTestSegment(WINDOW);

    const saved = await previewSavedSegment(segmentId, 0);
    const draft = await previewSegmentConditions(WINDOW, false, 0);
    const consumer = await readSegmentPersonIds(segmentId);

    expect(saved.total).toBe(2);
    expect(draft.total).toBe(saved.total);
    expect(consumer).toHaveLength(saved.total);
    expect(saved.limit).toBe(SEGMENT_PREVIEW_LIMIT);

    // Форма строки — то, что читает экран: давность, привязка, баланс числом.
    expect(saved.rows).toContainEqual({
      personId: linkedId,
      lastName: 'Тестов',
      firstName: 'Тест',
      middleName: null,
      callsigns: [],
      balance: BALANCE_FROM + 10,
      daysSinceTrip: 30,
      telegramLinked: true,
    });
  });

  it('страница со смещением не повторяет строку предыдущей', async () => {
    // Больше одной страницы, и имена у всех одинаковые: порядок держит только идентификатор.
    const count = SEGMENT_PREVIEW_LIMIT + 2;
    const personIds: string[] = [];

    for (let index = 0; index < count; index += 1) {
      personIds.push(await createDriver({ balance: BALANCE_FROM + 100 + index }));
    }

    const first = await previewSegmentConditions(WINDOW, false, 0);
    const second = await previewSegmentConditions(WINDOW, false, SEGMENT_PREVIEW_LIMIT);

    expect(first.total).toBe(count);
    expect(first.rows).toHaveLength(SEGMENT_PREVIEW_LIMIT);
    expect(second.rows).toHaveLength(count - SEGMENT_PREVIEW_LIMIT);

    const shown = [...first.rows, ...second.rows].map((row) => row.personId);

    expect(new Set(shown).size).toBe(count);
    expect([...shown].sort()).toEqual([...personIds].sort());
  });

  it('без завершённой поездки человек не проходит границу давности', async () => {
    const travelledId = await createDriver({ balance: BALANCE_FROM + 1, completedTripDaysAgo: 30 });
    const cancelledOnlyId = await createDriver({
      balance: BALANCE_FROM + 2,
      cancelledTripDaysAgo: 30,
    });
    const neverId = await createDriver({ balance: BALANCE_FROM + 3 });

    // Нижняя граница ноль — самая широкая из возможных: пропустить она могла бы любого,
    // у кого давность вообще посчиталась.
    const conditions: SegmentConditions = { ...WINDOW, daysSinceTripMin: 0 };
    const preview = await previewSegmentConditions(conditions, false, 0);

    expect(preview.rows.map((row) => row.personId)).toEqual([travelledId]);
    expect(preview.rows[0]?.daysSinceTrip).toBe(30);

    const segmentId = await createTestSegment(conditions);
    const consumer = await readSegmentPersonIds(segmentId);

    expect(consumer).toContain(travelledId);
    expect(consumer).not.toContain(cancelledOnlyId);
    expect(consumer).not.toContain(neverId);

    // Границы давности берутся включительно и считаются в сутках парка.
    const inside = await previewSegmentConditions(
      { ...WINDOW, daysSinceTripMin: 30, daysSinceTripMax: 30 },
      false,
      0,
    );
    const outside = await previewSegmentConditions(
      { ...WINDOW, daysSinceTripMin: 31, daysSinceTripMax: 90 },
      false,
      0,
    );

    expect(inside.rows.map((row) => row.personId)).toEqual([travelledId]);
    expect(outside.total).toBe(0);
  });

  it('без водительского счёта человек не подходит под условие по балансу', async () => {
    // Счёт с нулём и отсутствие счёта — разные вещи: первый под «баланс 0» подходит,
    // второй — нет.
    const zeroId = await createDriver({ balance: null });
    await ensureDriverAccount(zeroId);
    const withoutAccountId = await createDriver({ balance: null });

    const conditions: SegmentConditions = {
      ...EMPTY_SEGMENT_CONDITIONS,
      balanceMin: 0,
      balanceMax: 0,
    };
    const segmentId = await createTestSegment(conditions);
    const consumer = await readSegmentPersonIds(segmentId);

    expect(consumer).toContain(zeroId);
    expect(consumer).not.toContain(withoutAccountId);
  });

  it('архивный сегмент читается по ссылке и отдаёт состав', async () => {
    const personId = await createDriver({ balance: BALANCE_FROM + 5 });
    const segmentId = await createTestSegment(WINDOW);

    const archived = await setSegmentArchived(segmentId, true);

    expect(archived.archivedAt).not.toBeNull();

    const read = await readSegment(segmentId);

    expect(read.archivedAt).toBe(archived.archivedAt);
    expect((await previewSavedSegment(segmentId, 0)).total).toBe(1);
    expect(await readSegmentPersonIds(segmentId)).toEqual([personId]);

    const listed = (await readSegmentList()).segments.find(
      (segment) => segment.segmentId === segmentId,
    );

    expect(listed).toEqual(expect.objectContaining({ archivedAt: archived.archivedAt, total: 1 }));

    // Повтор архива время не двигает, возврат снимает отметку.
    expect((await setSegmentArchived(segmentId, true)).archivedAt).toBe(archived.archivedAt);
    expect((await setSegmentArchived(segmentId, false)).archivedAt).toBeNull();
  });
});
