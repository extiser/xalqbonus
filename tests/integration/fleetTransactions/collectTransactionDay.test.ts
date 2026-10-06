import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { FleetTransport } from '#server/adapters/fleet/client';
import {
  readFleetTransactionDay,
  readFleetTransactionDayClosed,
} from '#server/repositories/fleetTransactions';
import { parseParkDay, RepeatedRateLimitError } from '#server/services/fleetHistory/collectHistoryDay';
import {
  collectTransactionDay,
  TransactionDayStoppedError,
} from '#server/services/fleetTransactions/collectTransactionDay';
import { disconnectDatabase } from '../support/database';
import {
  cleanupTestTransactionDays,
  countTestTransactions,
  readTestTransactions,
} from '../support/fleetTransactions';
import { disconnectQueues } from '../support/queues';

/**
 * Сборщик истории транзакций парка против настоящей базы и поддельного транспорта Fleet.
 *
 * Запрос `upsertFleetTransactions` — `INSERT … ON CONFLICT` по `unnest` с колонками,
 * перечисленными руками, — и журнал суток с курсором продолжения. Миграция в любой из двух
 * таблиц сломает сборщик молча: типы расхождения со схемой не ловят (docs/infra.md → «Тесты»,
 * третье исключение). Тест гоняет их через `collectTransactionDay` — тем путём, которым их
 * зовёт прогон диапазона.
 *
 * Сутки — в 2001 году, глубже окна хранения Fleet: настоящих транзакций там нет и не будет.
 */

const TWO_PAGES_DAY = '2001-04-01';
const RESUME_DAY = '2001-04-02';
const EMPTY_DAY = '2001-04-03';
const PARK_DAYS = [TWO_PAGES_DAY, RESUME_DAY, EMPTY_DAY];

type RawTransaction = Record<string, unknown>;

/** Транзакция в форме живого ответа Fleet API, внутри суток `parkDay`. */
const buildRawTransaction = (id: string, parkDay: string, categoryId: string, amount: string): RawTransaction => ({
  id,
  event_at: `${parkDay}T10:00:00.123456+00:00`,
  category_id: categoryId,
  category_name: 'Тестовая категория',
  group_id: 'partner_fees',
  amount,
  currency_code: 'UZS',
  description: 'Комиссия парка за заказ',
  created_by: { identity: 'platform' },
  driver_profile_id: 'test-transactions-profile',
  order_id: `test-transactions-order-${id}`,
  order: { id: `test-transactions-order-${id}`, short_id: 1 },
  external_event_id: `taxi/taximeter_order/test-transactions-order-${id}`,
});

/**
 * Две страницы суток. На первой — комиссия парка, транзакция диспетчера без валюты (пишется,
 * считается отдельно) и транзакция без суммы (не пишется, `malformed`); на второй — наличные.
 */
const buildTwoPages = (parkDay: string): RawTransaction[][] => [
  [
    buildRawTransaction(`test-tx-${parkDay}-1`, parkDay, 'partner_ride_fee', '-1663.9500'),
    {
      ...buildRawTransaction(`test-tx-${parkDay}-2`, parkDay, 'partner_service_manual', '5000.0000'),
      currency_code: '',
      created_by: { identity: 'dispatcher', dispatcher_name: 'Тест Диспетчер' },
      order_id: null,
      external_event_id: null,
    },
    { ...buildRawTransaction(`test-tx-${parkDay}-bad`, parkDay, 'card', 'не число') },
  ],
  [buildRawTransaction(`test-tx-${parkDay}-3`, parkDay, 'cash_collected', '21000.0000')],
];

const writtenIdsOf = (parkDay: string): string[] =>
  [1, 2, 3].map((index) => `test-tx-${parkDay}-${index}`);

type TransactionsTransport = FleetTransport & {
  /** Курсоры запросов по порядку; `null` — запрос первой страницы. */
  readonly cursors: (string | null)[];
};

const readCursor = (body: unknown): string | null => {
  const cursor = (body as Record<string, unknown>)['cursor'];

  return typeof cursor === 'string' ? cursor : null;
};

/**
 * Поддельный транспорт: страницу выбирает по курсору из тела запроса, как Fleet API, — иначе
 * продолжение с сохранённого курсора было бы не отличить от обхода с начала. На последней
 * странице курсор пуст, как в живых ответах. `rateLimitOnCursor` — на запросе с этим курсором
 * отказ лимитом, тем же, что бросает обратный вызов клиента на втором 429 подряд.
 */
const createTransactionsTransport = (
  pages: readonly RawTransaction[][],
  rateLimitOnCursor: string | null = null,
): TransactionsTransport => {
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

      return { transactions: pages[index] ?? [], limit: 1000, cursor: isLast ? '' : `page-${index + 1}` } as Payload;
    },
    get: async () => {
      throw new Error('транзакции ходят методом POST');
    },
    stats: () => ({ requests: cursors.length, rateLimited: 0, waitedMs: 0 }),
  };
};

describe('сборщик истории транзакций: сутки', () => {
  beforeEach(async () => {
    await cleanupTestTransactionDays(PARK_DAYS);
  });

  afterAll(async () => {
    await cleanupTestTransactionDays(PARK_DAYS);
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('сутки из двух страниц: транзакции записаны, журнал закрыт, итоги сходятся', async () => {
    const summary = await collectTransactionDay(createTransactionsTransport(buildTwoPages(TWO_PAGES_DAY)), TWO_PAGES_DAY);

    expect(summary).toEqual(
      expect.objectContaining({
        parkDay: TWO_PAGES_DAY,
        transactions: 4,
        malformed: 1,
        pages: 2,
        written: 3,
        incomplete: 1,
      }),
    );

    expect(await readFleetTransactionDay(parseParkDay(TWO_PAGES_DAY))).toEqual({
      transactions: 4,
      malformed: 1,
      pages: 2,
      finishedAt: expect.any(Date),
      nextCursor: null,
    });
    expect(await readFleetTransactionDayClosed(parseParkDay(TWO_PAGES_DAY))).toBe(true);
    expect(await countTestTransactions(TWO_PAGES_DAY)).toBe(3);

    // Форма строки — то, что разложил `unnest`: каждая колонка на своём месте.
    const [fee, manual] = await readTestTransactions(writtenIdsOf(TWO_PAGES_DAY));

    expect(fee).toEqual({
      id: `test-tx-${TWO_PAGES_DAY}-1`,
      eventAt: new Date(`${TWO_PAGES_DAY}T10:00:00.123Z`),
      categoryId: 'partner_ride_fee',
      amount: '-1663.9500',
      currencyCode: 'UZS',
      driverProfileId: 'test-transactions-profile',
      orderId: `test-transactions-order-test-tx-${TWO_PAGES_DAY}-1`,
      externalEventId: `taxi/taximeter_order/test-transactions-order-test-tx-${TWO_PAGES_DAY}-1`,
      description: 'Комиссия парка за заказ',
      createdBy: 'platform',
      createdByDispatcher: null,
    });
    expect(manual).toEqual(
      expect.objectContaining({
        currencyCode: null,
        orderId: null,
        externalEventId: null,
        createdBy: 'dispatcher',
        createdByDispatcher: 'Тест Диспетчер',
      }),
    );
  });

  it('повтор тех же транзакций строк не прибавляет', async () => {
    const pages = buildTwoPages(TWO_PAGES_DAY);

    await collectTransactionDay(createTransactionsTransport(pages), TWO_PAGES_DAY);
    const repeated = await collectTransactionDay(createTransactionsTransport(pages), TWO_PAGES_DAY);

    expect(repeated).toEqual(expect.objectContaining({ transactions: 4, pages: 2, written: 3 }));
    expect(await countTestTransactions(TWO_PAGES_DAY)).toBe(3);
    expect(await readTestTransactions(writtenIdsOf(TWO_PAGES_DAY))).toHaveLength(3);
  });

  it('обрыв после первой страницы оставляет курсор, повтор продолжает со второй', async () => {
    const pages = buildTwoPages(RESUME_DAY);
    const parkDay = parseParkDay(RESUME_DAY);

    expect(await readFleetTransactionDayClosed(parkDay)).toBeNull();

    const broken = collectTransactionDay(createTransactionsTransport(pages, 'page-1'), RESUME_DAY);

    await expect(broken).rejects.toBeInstanceOf(TransactionDayStoppedError);
    await expect(broken).rejects.toMatchObject({
      written: 2,
      incomplete: 1,
      cause: expect.any(RepeatedRateLimitError),
    });

    // Первая страница записана вместе с итогами и курсором второй, сутки не закрыты.
    expect(await readFleetTransactionDay(parkDay)).toEqual({
      transactions: 3,
      malformed: 1,
      pages: 1,
      finishedAt: null,
      nextCursor: 'page-1',
    });
    expect(await readFleetTransactionDayClosed(parkDay)).toBe(false);
    expect(await countTestTransactions(RESUME_DAY)).toBe(2);

    const transport = createTransactionsTransport(pages);
    const resumed = await collectTransactionDay(transport, RESUME_DAY);

    // Первая страница второй раз не запрашивалась: обход начат с сохранённого курсора.
    expect(transport.cursors).toEqual(['page-1']);
    expect(resumed).toEqual(
      expect.objectContaining({ transactions: 4, malformed: 1, pages: 2, written: 1, incomplete: 0 }),
    );
    expect(await readFleetTransactionDay(parkDay)).toEqual({
      transactions: 4,
      malformed: 1,
      pages: 2,
      finishedAt: expect.any(Date),
      nextCursor: null,
    });
    expect(await countTestTransactions(RESUME_DAY)).toBe(3);
  });

  it('пустые сутки закрываются нулями', async () => {
    const summary = await collectTransactionDay(createTransactionsTransport([[]]), EMPTY_DAY);

    expect(summary).toEqual(expect.objectContaining({ transactions: 0, malformed: 0, written: 0 }));
    expect(await readFleetTransactionDay(parseParkDay(EMPTY_DAY))).toEqual({
      transactions: 0,
      malformed: 0,
      pages: 1,
      finishedAt: expect.any(Date),
      nextCursor: null,
    });
    expect(await countTestTransactions(EMPTY_DAY)).toBe(0);
  });
});
