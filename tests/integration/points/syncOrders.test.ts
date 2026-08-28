import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { FleetTransport } from '#server/adapters/fleet/client';
import { runOrdersSync } from '#server/services/sync/syncOrders';
import {
  cleanupTestData,
  countTripEvents,
  createTestPerson,
  disconnectDatabase,
  readAccountBalance,
  readSyncRuns,
  readSyncWatermark,
  readTripStatus,
  resetOrdersSyncState,
  type TestPerson,
} from '../support/database';

/**
 * Прогон синхронизации заказов против настоящей базы и поддельного транспорта.
 *
 * Проверяются три из пяти сценариев, ради которых тесты вообще пишутся (docs/infra.md):
 * перекрывающиеся окна опроса, поездка, пришедшая из промежуточного статуса, и повторная
 * запись с тем же ключом идемпотентности. Сеть подменена, база настоящая — именно в базе
 * живут уникальные ограничения, на которых всё это держится.
 */

// Настройки окна фиксируются тестом: иначе ожидаемые границы зависели бы от `.env`
// той машины, где прогоняются тесты.
process.env['SYNC_LIVE_OVERLAP_MIN'] = '10';
process.env['SYNC_LIVE_LAG_SEC'] = '60';
process.env['SYNC_LIVE_MAX_WINDOW_MIN'] = '360';
process.env['SYNC_PAGE_LIMIT'] = '500';
process.env['SYNC_CATCHUP_DAYS'] = '7';

const NOW = new Date('2026-08-28T12:00:00.000Z');
const LAG_MS = 60_000;

type RawOrder = Record<string, unknown>;

const buildRawOrder = (
  orderId: string,
  profileId: string,
  status: string,
  endedAt: string | null,
): RawOrder => ({
  id: orderId,
  short_id: 26_254_091,
  status,
  created_at: '2026-08-28T11:40:00.000+00:00',
  booked_at: '2026-08-28T11:42:00.000+00:00',
  provider: 'platform',
  category: 'start',
  amenities: [],
  address_from: { address: 'Ташкент, тестовый адрес', lat: 41.3, lon: 69.24 },
  route_points: [{ address: 'Ташкент, точка маршрута', lat: 41.31, lon: 69.25 }],
  events:
    endedAt === null
      ? [{ event_at: '2026-08-28T11:43:00.000+00:00', order_status: 'transporting' }]
      : [
          { event_at: '2026-08-28T11:43:00.000+00:00', order_status: 'transporting' },
          { event_at: endedAt, order_status: status },
        ],
  ended_at: endedAt,
  payment_method: 'cash',
  driver_profile: { id: profileId, name: 'Тест Тестов' },
  car: {
    id: 'test-car',
    brand_model: 'Chevrolet Cobalt',
    license: { number: '01A123AA' },
    callsign: '1234',
  },
  type: { id: 'test-type', name: 'Яндекс' },
  price: '25000.0000',
  mileage: '5000.0000',
  driving_at: '2026-08-28T11:41:00.000+00:00',
  flags: [],
});

/**
 * Поддельный транспорт: отдаёт заранее заготовленные страницы, окно запроса игнорирует.
 * Окно проверяется своим тестом, здесь проверяется то, что происходит с полученными
 * заказами в базе.
 */
const makeTransport = (pages: readonly RawOrder[][]): FleetTransport => {
  let issued = 0;

  return {
    parkId: 'test-park',
    post: async <Payload>(): Promise<Payload> => {
      const orders = pages[issued] ?? [];
      issued += 1;
      const isLast = issued >= pages.length;

      return { orders, limit: 500, cursor: isLast ? '' : `page-${issued}` } as Payload;
    },
    stats: () => ({ requests: issued, rateLimited: 0, waitedMs: 0 }),
  };
};

/** Транспорт, который падает: так выглядит прогон, оборванный на середине. */
const failingTransport = (): FleetTransport => ({
  parkId: 'test-park',
  post: async () => {
    throw new Error('связь оборвалась');
  },
  stats: () => ({ requests: 1, rateLimited: 3, waitedMs: 0 }),
});

describe('прогон синхронизации заказов', () => {
  let driver: TestPerson;

  beforeAll(async () => {
    await resetOrdersSyncState();
  });

  afterEach(async () => {
    await cleanupTestData();
    await resetOrdersSyncState();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('записывает завершённый заказ, начисляет балл и двигает отметку по верхней границе окна', async () => {
    driver = await createTestPerson({ inProgram: true });
    const orderId = `order-${driver.profileId}`;

    const summary = await runOrdersSync('orders', {
      now: NOW,
      client: makeTransport([
        [buildRawOrder(orderId, driver.profileId, 'complete', '2026-08-28T11:50:00.000+00:00')],
      ]),
    });

    expect(summary.status).toBe('succeeded');
    expect(summary.ordersWritten).toBe(1);
    expect(summary.accrual.awarded).toBe(1);
    expect(await readAccountBalance(driver.personId)).toBe(1n);
    expect(await readTripStatus(orderId)).toBe('complete');
    expect(await countTripEvents(orderId)).toBe(2);

    // Отметка по верхней границе окна, а не по времени завершения последнего заказа:
    // иначе тихий час без поездок навсегда оставил бы её в прошлом.
    expect((await readSyncWatermark('orders'))?.toISOString()).toBe(
      new Date(NOW.getTime() - LAG_MS).toISOString(),
    );

    const runs = await readSyncRuns('orders');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('succeeded');
    expect(runs[0]?.itemsWritten).toBe(1);
  });

  it('повтор перекрывающегося окна не меняет ни баланса, ни числа событий', async () => {
    driver = await createTestPerson({ inProgram: true });
    const orderId = `order-${driver.profileId}`;
    const order = buildRawOrder(orderId, driver.profileId, 'complete', '2026-08-28T11:50:00.000+00:00');

    await runOrdersSync('orders', { now: NOW, client: makeTransport([[order]]) });

    const balanceAfterFirst = await readAccountBalance(driver.personId);
    const eventsAfterFirst = await countTripEvents(orderId);

    // Второй прогон: окно строится от отметки минус перекрытие, то есть заходит на уже
    // прочитанное. Тот же заказ приезжает второй раз — так и задумано.
    const second = await runOrdersSync('orders', {
      now: new Date(NOW.getTime() + 60_000),
      client: makeTransport([[order]]),
    });

    expect(second.accrual.awarded).toBe(0);
    expect(second.accrual.alreadyAwarded).toBe(1);
    expect(await readAccountBalance(driver.personId)).toBe(balanceAfterFirst);
    expect(await countTripEvents(orderId)).toBe(eventsAfterFirst);
  });

  it('заказ из промежуточного статуса не начисляется, а завершившись — начисляется', async () => {
    driver = await createTestPerson({ inProgram: true });
    const orderId = `order-${driver.profileId}`;

    const first = await runOrdersSync('orders', {
      now: NOW,
      client: makeTransport([[buildRawOrder(orderId, driver.profileId, 'transporting', null)]]),
    });

    expect(first.ordersWritten).toBe(1);
    expect(first.accrual.awarded).toBe(0);
    expect(await readAccountBalance(driver.personId)).toBe(0n);
    expect(await readTripStatus(orderId)).toBe('transporting');

    // Тот же заказ, завершившийся позже. Ровно здесь старый бот терял пятую часть поездок:
    // его окно по времени бронирования этот заказ больше не возвращало.
    const second = await runOrdersSync('orders', {
      now: new Date(NOW.getTime() + 60_000),
      client: makeTransport([
        [buildRawOrder(orderId, driver.profileId, 'complete', '2026-08-28T11:55:00.000+00:00')],
      ]),
    });

    expect(second.accrual.awarded).toBe(1);
    expect(await readTripStatus(orderId)).toBe('complete');
    expect(await readAccountBalance(driver.personId)).toBe(1n);
  });

  it('водитель вне программы: заказ записан, баллы не начислены', async () => {
    driver = await createTestPerson({ inProgram: false });
    const orderId = `order-${driver.profileId}`;

    const summary = await runOrdersSync('orders', {
      now: NOW,
      client: makeTransport([
        [buildRawOrder(orderId, driver.profileId, 'complete', '2026-08-28T11:50:00.000+00:00')],
      ]),
    });

    expect(summary.ordersWritten).toBe(1);
    expect(summary.accrual.outsideProgram).toBe(1);
    expect(summary.accrual.awarded).toBe(0);
    expect(await readTripStatus(orderId)).toBe('complete');
  });

  it('заказ водителя, которого нет в реестре, прогон не роняет', async () => {
    driver = await createTestPerson({ inProgram: true });
    const knownOrderId = `order-${driver.profileId}`;

    const summary = await runOrdersSync('orders', {
      now: NOW,
      client: makeTransport([
        [
          buildRawOrder('order-unknown-driver', 'profile-never-seen', 'complete', '2026-08-28T11:50:00.000+00:00'),
          buildRawOrder(knownOrderId, driver.profileId, 'complete', '2026-08-28T11:51:00.000+00:00'),
        ],
      ]),
    });

    expect(summary.status).toBe('succeeded');
    expect(summary.skippedUnknownProfile).toBe(1);
    expect(summary.unknownProfiles).toBe(1);
    // Не только сколько, но и кто: заказ этого водителя не записан, и вернуться за ним
    // можно будет только по идентификатору профиля.
    expect(summary.unknownProfileIds).toEqual(['profile-never-seen']);
    expect(summary.ordersWritten).toBe(1);
    expect(await readTripStatus('order-unknown-driver')).toBeNull();
    expect(await readAccountBalance(driver.personId)).toBe(1n);
  });

  it('упавший прогон не двигает отметку и остаётся в базе отказом', async () => {
    driver = await createTestPerson({ inProgram: true });

    await runOrdersSync('orders', {
      now: NOW,
      client: makeTransport([
        [buildRawOrder(`order-${driver.profileId}`, driver.profileId, 'complete', '2026-08-28T11:50:00.000+00:00')],
      ]),
    });

    const watermarkBefore = await readSyncWatermark('orders');

    await expect(
      runOrdersSync('orders', { now: new Date(NOW.getTime() + 60_000), client: failingTransport() }),
    ).rejects.toThrow('связь оборвалась');

    // Именно сдвиг отметки при неуспехе породил в старом боте счётчик дней простоя
    // и скрыл отказы по лимиту (docs/decisions.md).
    expect((await readSyncWatermark('orders'))?.toISOString()).toBe(watermarkBefore?.toISOString());

    const runs = await readSyncRuns('orders');
    expect(runs).toHaveLength(2);
    expect(runs[1]?.status).toBe('failed');
    expect(runs[1]?.error).toContain('связь оборвалась');
    // Счётчики упавшего прогона пишутся тоже: у него важнее всего видеть отказы по лимиту.
    expect(runs[1]?.rateLimited).toBe(3);
  });

  it('несколько страниц читаются курсором до конца выборки', async () => {
    driver = await createTestPerson({ inProgram: true });

    const summary = await runOrdersSync('orders', {
      now: NOW,
      client: makeTransport([
        [buildRawOrder(`order-1-${driver.profileId}`, driver.profileId, 'complete', '2026-08-28T11:50:00.000+00:00')],
        [buildRawOrder(`order-2-${driver.profileId}`, driver.profileId, 'complete', '2026-08-28T11:51:00.000+00:00')],
      ]),
    });

    expect(summary.pages).toBe(2);
    expect(summary.ordersWritten).toBe(2);
    expect(await readAccountBalance(driver.personId)).toBe(2n);
  });
});
