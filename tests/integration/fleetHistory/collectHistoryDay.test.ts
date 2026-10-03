import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { FleetTransport } from '#server/adapters/fleet/client';
import {
  readFleetOrderHistoryDay,
  readFleetOrderHistoryDayClosed,
} from '#server/repositories/fleetOrderHistory';
import {
  collectHistoryDay,
  HistoryDayStoppedError,
  parseParkDay,
  RepeatedRateLimitError,
} from '#server/services/fleetHistory/collectHistoryDay';
import { disconnectDatabase } from '../support/database';
import {
  cleanupTestHistoryDays,
  countTestHistoryOrders,
  readTestHistoryOrders,
} from '../support/fleetHistory';
import { disconnectQueues } from '../support/queues';

/**
 * Сборщик истории заказов парка против настоящей базы и поддельного транспорта Fleet.
 *
 * Запросы `server/repositories/fleetOrderHistory.ts` — `INSERT … ON CONFLICT` по `unnest`
 * с колонками, перечисленными руками, и журнал суток с курсором продолжения. Миграция
 * в любой из двух таблиц сломает сборщик молча: типы расхождения со схемой не ловят
 * (docs/infra.md → «Тесты», третье исключение). Тест гоняет их через `collectHistoryDay` —
 * тем путём, которым их зовёт прогон диапазона.
 *
 * Сутки — в 2001 году, глубже окна хранения Fleet: настоящих заказов там нет и не будет.
 */

const TWO_PAGES_DAY = '2001-03-01';
const RESUME_DAY = '2001-03-02';
const EMPTY_DAY = '2001-03-03';
const PARK_DAYS = [TWO_PAGES_DAY, RESUME_DAY, EMPTY_DAY];

const PROFILE_ID = 'test-history-profile';

type RawOrder = Record<string, unknown>;

/** Заказ в форме ответа Fleet API, завершённый внутри суток `parkDay`. */
const buildRawOrder = (orderId: string, parkDay: string, status: string): RawOrder => ({
  id: orderId,
  short_id: 26_254_091,
  status,
  created_at: `${parkDay}T09:40:00.000+00:00`,
  booked_at: `${parkDay}T09:42:00.000+00:00`,
  provider: 'platform',
  category: 'start',
  amenities: [],
  address_from: { address: 'Ташкент, тестовый адрес', lat: 41.3, lon: 69.24 },
  route_points: [],
  events: [{ event_at: `${parkDay}T10:00:00.000+00:00`, order_status: status }],
  ended_at: `${parkDay}T10:00:00.000+00:00`,
  payment_method: 'cash',
  driver_profile: { id: PROFILE_ID, name: 'Тест Тестов' },
  driver_work_rule: { id: 'test-work-rule' },
  car: {
    id: 'test-car',
    brand_model: 'Chevrolet Cobalt',
    license: { number: '01A123AA' },
    callsign: '1234',
  },
  type: { id: 'test-type', name: 'Яндекс' },
  price: '25000.5000',
  mileage: '5000.0000',
  flags: [],
});

/** Две страницы суток: на первой завершённый и отменённый, на второй завершённый. */
const buildTwoPages = (parkDay: string): RawOrder[][] => [
  [
    buildRawOrder(`test-history-${parkDay}-1`, parkDay, 'complete'),
    buildRawOrder(`test-history-${parkDay}-2`, parkDay, 'cancelled'),
  ],
  [buildRawOrder(`test-history-${parkDay}-3`, parkDay, 'complete')],
];

const orderIdsOf = (pages: RawOrder[][]): string[] =>
  pages.flat().map((order) => String(order['id']));

type HistoryTransport = FleetTransport & {
  /** Курсоры запросов по порядку; `null` — запрос первой страницы. */
  readonly cursors: (string | null)[];
};

const readCursor = (body: unknown): string | null => {
  const cursor = (body as Record<string, unknown>)['cursor'];

  return typeof cursor === 'string' ? cursor : null;
};

/**
 * Поддельный транспорт: страницу выбирает по курсору из тела запроса, как Fleet API, —
 * иначе продолжение с сохранённого курсора было бы не отличить от обхода с начала.
 * `rateLimitOnCursor` — на запросе с этим курсором отказ лимитом, тем же, что бросает
 * обратный вызов клиента на втором 429 подряд.
 */
const createHistoryTransport = (
  pages: readonly RawOrder[][],
  rateLimitOnCursor: string | null = null,
): HistoryTransport => {
  const cursors: (string | null)[] = [];

  return {
    parkId: 'test-park',
    cursors,
    post: async <Payload>(_path: string, body: unknown, description: string): Promise<Payload> => {
      const cursor = readCursor(body);
      cursors.push(cursor);

      if (cursor !== null && cursor === rateLimitOnCursor) {
        throw new RepeatedRateLimitError(description, 2);
      }

      const index = cursor === null ? 0 : Number(cursor.replace('page-', ''));
      const isLast = index + 1 >= pages.length;

      return { orders: pages[index] ?? [], limit: 500, cursor: isLast ? '' : `page-${index + 1}` } as Payload;
    },
    get: async () => {
      throw new Error('история ходит методом POST: справочник в этом тесте не запрашивается');
    },
    stats: () => ({ requests: cursors.length, rateLimited: 0, waitedMs: 0 }),
  };
};

describe('сборщик истории заказов: сутки', () => {
  beforeEach(async () => {
    await cleanupTestHistoryDays(PARK_DAYS);
  });

  afterAll(async () => {
    await cleanupTestHistoryDays(PARK_DAYS);
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('сутки из двух страниц: заказы записаны, журнал закрыт, итоги сходятся', async () => {
    const pages = buildTwoPages(TWO_PAGES_DAY);

    const summary = await collectHistoryDay(createHistoryTransport(pages), TWO_PAGES_DAY);

    expect(summary).toEqual(
      expect.objectContaining({
        parkDay: TWO_PAGES_DAY,
        orders: 3,
        complete: 2,
        malformed: 0,
        pages: 2,
        written: 3,
      }),
    );

    expect(await readFleetOrderHistoryDay(parseParkDay(TWO_PAGES_DAY))).toEqual({
      orders: 3,
      complete: 2,
      malformed: 0,
      pages: 2,
      finishedAt: expect.any(Date),
      nextCursor: null,
    });
    expect(await readFleetOrderHistoryDayClosed(parseParkDay(TWO_PAGES_DAY))).toBe(true);
    expect(await countTestHistoryOrders(TWO_PAGES_DAY)).toBe(3);

    // Форма строки — то, что разложил `unnest`: каждая колонка на своём месте.
    const [first] = await readTestHistoryOrders([`test-history-${TWO_PAGES_DAY}-1`]);

    expect(first).toEqual({
      orderId: `test-history-${TWO_PAGES_DAY}-1`,
      profileId: PROFILE_ID,
      status: 'complete',
      category: 'start',
      paymentMethod: 'cash',
      workRuleId: 'test-work-rule',
      bookedAt: new Date(`${TWO_PAGES_DAY}T09:42:00.000Z`),
      endedAt: new Date(`${TWO_PAGES_DAY}T10:00:00.000Z`),
      price: '25000.50',
      carCallsign: '1234',
    });
  });

  it('повтор закрытых суток строк в истории не прибавляет', async () => {
    const pages = buildTwoPages(TWO_PAGES_DAY);

    await collectHistoryDay(createHistoryTransport(pages), TWO_PAGES_DAY);
    const journal = await readFleetOrderHistoryDay(parseParkDay(TWO_PAGES_DAY));

    const repeated = await collectHistoryDay(createHistoryTransport(pages), TWO_PAGES_DAY);

    expect(repeated).toEqual(expect.objectContaining({ orders: 3, complete: 2, pages: 2 }));
    expect(await countTestHistoryOrders(TWO_PAGES_DAY)).toBe(3);
    expect(await readTestHistoryOrders(orderIdsOf(pages))).toHaveLength(3);
    expect(await readFleetOrderHistoryDay(parseParkDay(TWO_PAGES_DAY))).toEqual({
      ...journal,
      finishedAt: expect.any(Date),
    });
  });

  it('обрыв после первой страницы оставляет курсор, повтор продолжает со второй', async () => {
    const pages = buildTwoPages(RESUME_DAY);
    const parkDay = parseParkDay(RESUME_DAY);

    expect(await readFleetOrderHistoryDayClosed(parkDay)).toBeNull();

    const broken = collectHistoryDay(createHistoryTransport(pages, 'page-1'), RESUME_DAY);

    await expect(broken).rejects.toBeInstanceOf(HistoryDayStoppedError);
    await expect(broken).rejects.toMatchObject({
      written: 2,
      cause: expect.any(RepeatedRateLimitError),
    });

    // Первая страница записана вместе с итогами и курсором второй, сутки не закрыты.
    expect(await readFleetOrderHistoryDay(parkDay)).toEqual({
      orders: 2,
      complete: 1,
      malformed: 0,
      pages: 1,
      finishedAt: null,
      nextCursor: 'page-1',
    });
    expect(await readFleetOrderHistoryDayClosed(parkDay)).toBe(false);
    expect(await countTestHistoryOrders(RESUME_DAY)).toBe(2);

    const transport = createHistoryTransport(pages);
    const resumed = await collectHistoryDay(transport, RESUME_DAY);

    // Первая страница второй раз не запрашивалась: обход начат с сохранённого курсора.
    expect(transport.cursors).toEqual(['page-1']);
    expect(resumed).toEqual(
      expect.objectContaining({ orders: 3, complete: 2, malformed: 0, pages: 2, written: 1 }),
    );
    expect(await readFleetOrderHistoryDay(parkDay)).toEqual({
      orders: 3,
      complete: 2,
      malformed: 0,
      pages: 2,
      finishedAt: expect.any(Date),
      nextCursor: null,
    });
    expect(await countTestHistoryOrders(RESUME_DAY)).toBe(3);
  });

  it('пустые сутки закрываются нулями', async () => {
    const summary = await collectHistoryDay(createHistoryTransport([[]]), EMPTY_DAY);

    expect(summary).toEqual(
      expect.objectContaining({ orders: 0, complete: 0, malformed: 0, written: 0 }),
    );

    // Страница одна — запрос, ответивший пустым списком.
    expect(await readFleetOrderHistoryDay(parseParkDay(EMPTY_DAY))).toEqual({
      orders: 0,
      complete: 0,
      malformed: 0,
      pages: 1,
      finishedAt: expect.any(Date),
      nextCursor: null,
    });
    expect(await readFleetOrderHistoryDayClosed(parseParkDay(EMPTY_DAY))).toBe(true);
    expect(await countTestHistoryOrders(EMPTY_DAY)).toBe(0);
  });
});
