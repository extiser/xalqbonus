import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { FleetTransport } from '#server/adapters/fleet/client';
import { failAbandonedRuns } from '#server/repositories/syncRuns';
import { runOrdersSync } from '#server/services/sync/syncOrders';
import {
  cleanupTestData,
  countTripEvents,
  createTestPerson,
  disconnectDatabase,
  insertRunningSyncRun,
  readAccountBalance,
  readSyncRuns,
  readSyncWatermark,
  readSyncRunOrders,
  readSyncSkips,
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

/**
 * Транспорт, отдающий страницы и падающий следом. Так выглядит прогон, оборванный после
 * того, как часть работы уже сделана: у него и проверяется, что успетое осталось в базе.
 */
const transportFailingAfter = (pages: readonly RawOrder[][]): FleetTransport => {
  let issued = 0;

  return {
    parkId: 'test-park',
    post: async <Payload>(): Promise<Payload> => {
      if (issued >= pages.length) {
        throw new Error('связь оборвалась');
      }

      const orders = pages[issued] ?? [];
      issued += 1;

      return { orders, limit: 500, cursor: `page-${issued}` } as Payload;
    },
    stats: () => ({ requests: issued + 1, rateLimited: 0, waitedMs: 0 }),
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
    expect(summary.ordersInserted).toBe(1);
    expect(summary.ordersUpdated).toBe(0);
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
    // Заказ тронут, но не появился: «записано 1» без этого разделения читалось бы как
    // «прибавилась поездка», хотя не изменилось ничего.
    expect(second.ordersInserted).toBe(0);
    expect(second.ordersUpdated).toBe(1);
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

/**
 * Журнал прогона: всё, что прогон считает и говорит одной строкой в лог, обязано
 * оставаться в базе и доставаться запросом.
 *
 * До этой таблицы на вопрос «сколько заказов мы потеряли за неделю и чьих именно» отвечал
 * только греп по логам контейнера — до первой ротации лога, перезапуска или `down`.
 */
describe('журнал прогона синхронизации', () => {
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

  it('детали прогона в базе — те же числа, что и в сводке', async () => {
    driver = await createTestPerson({ inProgram: true });
    // Реестр парка шире программы: заказ этого водителя записывается, а балл за него
    // не начисляется. В деталях прогона это отдельный счётчик, а не потеря.
    const outsider = await createTestPerson({ inProgram: false });

    const summary = await runOrdersSync('orders', {
      now: NOW,
      client: makeTransport([
        [
          buildRawOrder(`order-1-${driver.profileId}`, driver.profileId, 'complete', '2026-08-28T11:50:00.000+00:00'),
          buildRawOrder('order-stranger', 'profile-never-seen', 'complete', '2026-08-28T11:51:00.000+00:00'),
        ],
        [
          buildRawOrder(`order-2-${outsider.profileId}`, outsider.profileId, 'complete', '2026-08-28T11:52:00.000+00:00'),
        ],
      ]),
    });

    const details = await readSyncRunOrders(summary.runId as string);

    expect(details).toEqual({
      pages: summary.pages,
      ordersInserted: summary.ordersInserted,
      ordersUpdated: summary.ordersUpdated,
      malformed: summary.malformed,
      skippedUnknownProfile: summary.skippedUnknownProfile,
      unknownProfiles: summary.unknownProfiles,
      awarded: summary.accrual.awarded,
      alreadyAwarded: summary.accrual.alreadyAwarded,
      notCompleted: summary.accrual.notCompleted,
      withoutEndedAt: summary.accrual.withoutEndedAt,
      outsideProgram: summary.accrual.outsideProgram,
      unknownTrip: summary.accrual.unknownTrip,
    });
    // Сводка не пустая: сверять нули с нулями смысла нет.
    expect(details?.pages).toBe(2);
    expect(details?.ordersInserted).toBe(2);
    expect(details?.skippedUnknownProfile).toBe(1);
    expect(details?.unknownProfiles).toBe(1);
    expect(details?.awarded).toBe(1);
    expect(details?.outsideProgram).toBe(1);
  });

  it('упавший прогон оставляет детали того, что успел', async () => {
    driver = await createTestPerson({ inProgram: true });

    await expect(
      runOrdersSync('orders', {
        now: NOW,
        client: transportFailingAfter([
          [
            buildRawOrder(
              `order-${driver.profileId}`,
              driver.profileId,
              'complete',
              '2026-08-28T11:50:00.000+00:00',
            ),
          ],
        ]),
      }),
    ).rejects.toThrow('связь оборвалась');

    const runs = await readSyncRuns('orders');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('failed');

    // У упавшего прогона детали важнее всего: без них видно только «упал», а сколько он
    // успел разобрать и начислить до обрыва — неизвестно.
    const details = await readSyncRunOrders(runs[0]?.id as string);
    expect(details?.pages).toBe(1);
    expect(details?.ordersInserted).toBe(1);
    expect(details?.awarded).toBe(1);
  });

  it('заказ незнакомого водителя ложится строкой пропущенного, повтор её не удваивает', async () => {
    driver = await createTestPerson({ inProgram: true });
    const order = buildRawOrder('order-stranger', 'profile-never-seen', 'complete', '2026-08-28T11:50:00.000+00:00');

    const first = await runOrdersSync('orders', { now: NOW, client: makeTransport([[order]]) });

    const afterFirst = await readSyncSkips();
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]?.reason).toBe('unknown_profile');
    // Ссылка — заказ, деталь — водитель. Именно заказ мы потеряли, и именно по нему
    // потом видно, что он наконец записался.
    expect(afterFirst[0]?.reference).toBe('order-stranger');
    expect(afterFirst[0]?.detail).toBe('profile-never-seen');
    expect(afterFirst[0]?.timesSeen).toBe(1);
    expect(afterFirst[0]?.resolvedAt).toBeNull();
    expect(afterFirst[0]?.firstRunId).toBe(first.runId);

    // Перекрытие окон приносит тот же пропущенный заказ каждый прогон. Без уникальности
    // по паре «причина + ссылка» таблица росла бы линейно по времени, и вопрос «сколько
    // потеряно» перестал бы иметь ответ.
    const second = await runOrdersSync('orders', {
      now: new Date(NOW.getTime() + 60_000),
      client: makeTransport([[order]]),
    });

    const afterSecond = await readSyncSkips();
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]?.timesSeen).toBe(2);
    expect(afterSecond[0]?.firstRunId).toBe(first.runId);
    expect(afterSecond[0]?.lastRunId).toBe(second.runId);
  });

  it('пропущенных больше полусотни — в базу едут все, а обрезан только образец для лога', async () => {
    const strangers = Array.from({ length: 60 }, (_, index) =>
      buildRawOrder(`order-stranger-${index}`, `profile-never-seen-${index}`, 'complete', '2026-08-28T11:50:00.000+00:00'),
    );

    const summary = await runOrdersSync('orders', { now: NOW, client: makeTransport([strangers]) });

    expect(summary.skippedUnknownProfile).toBe(60);
    // Список в сводке — образец для одной строки лога, и он обрезан.
    expect(summary.unknownProfileIds).toHaveLength(50);

    // В базе обрезки нет: то, что за пятидесятым, иначе не было бы названо нигде.
    const skips = await readSyncSkips();
    expect(skips.filter((skip) => skip.reason === 'unknown_profile')).toHaveLength(60);
  });

  it('неразобранный заказ записан поимённо, а разобравшись — помечен решённым', async () => {
    driver = await createTestPerson({ inProgram: true });
    const orderId = `order-${driver.profileId}`;
    const broken = buildRawOrder(orderId, driver.profileId, 'complete', '2026-08-28T11:50:00.000+00:00');
    delete broken['payment_method'];

    const first = await runOrdersSync('orders', { now: NOW, client: makeTransport([[broken]]) });

    expect(first.malformed).toBe(1);
    const afterFirst = await readSyncSkips();
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]?.reason).toBe('malformed');
    expect(afterFirst[0]?.reference).toBe(orderId);
    expect(afterFirst[0]?.detail).toBe('payment_method');
    expect(afterFirst[0]?.resolvedAt).toBeNull();

    // Тот же заказ, пришедший целым. `resolved_at` и есть разница между «что потеряно
    // до сих пор» и «что когда-либо пропускалось».
    await runOrdersSync('orders', {
      now: new Date(NOW.getTime() + 60_000),
      client: makeTransport([
        [buildRawOrder(orderId, driver.profileId, 'complete', '2026-08-28T11:50:00.000+00:00')],
      ]),
    });

    const afterSecond = await readSyncSkips();
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]?.resolvedAt).not.toBeNull();
    expect(await readTripStatus(orderId)).toBe('complete');
  });

  it('незнакомое значение чужого словаря остаётся в базе с именем словаря', async () => {
    driver = await createTestPerson({ inProgram: true });
    const order = buildRawOrder(
      `order-${driver.profileId}`,
      driver.profileId,
      'complete',
      '2026-08-28T11:50:00.000+00:00',
    );
    order['category'] = 'hyperloop';

    const summary = await runOrdersSync('orders', { now: NOW, client: makeTransport([[order]]) });

    // Заказ записан: чужой словарь нам не принадлежит, и новое значение на той стороне
    // не роняет синхронизацию (docs/decisions.md).
    expect(summary.ordersWritten).toBe(1);

    const skips = await readSyncSkips();
    expect(skips).toHaveLength(1);
    expect(skips[0]?.reason).toBe('unknown_value');
    expect(skips[0]?.reference).toBe('category=hyperloop');
    expect(skips[0]?.detail).toBe('category');
    // Заказ записался, но незнакомое значение этим не закрывается: словарь закрывается тем,
    // что мы его узнали, а не следующим прогоном.
    expect(skips[0]?.resolvedAt).toBeNull();
  });

  it('одно значение из двух словарей — две строки, а не одна', async () => {
    driver = await createTestPerson({ inProgram: true });
    const order = buildRawOrder(
      `order-${driver.profileId}`,
      driver.profileId,
      'complete',
      '2026-08-28T11:50:00.000+00:00',
    );
    // Статус заказа и статус события проверяются по одному и тому же набору известных
    // значений, поэтому новый статус приходит сразу из двух словарей.
    order['status'] = 'teleport';
    order['events'] = [{ event_at: '2026-08-28T11:50:00.000+00:00', order_status: 'teleport' }];

    await runOrdersSync('orders', { now: NOW, client: makeTransport([[order]]) });

    // Ссылкой служит строка `словарь=значение` целиком. Будь ею одно значение, эти две
    // записи схлопнулись бы уникальностью в одну, и словарь, в котором расширение,
    // оказался бы тем, чью запись обработали первой.
    const skips = await readSyncSkips();
    expect(skips).toHaveLength(2);
    expect(skips.map((skip) => skip.reference)).toEqual(['event_status=teleport', 'status=teleport']);
    expect(skips.map((skip) => skip.detail)).toEqual(['event_status', 'status']);
  });
});

describe('брошенные прогоны', () => {
  afterEach(async () => {
    await resetOrdersSyncState();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('строка, оставшаяся бежать после убитого процесса, закрывается отказом', async () => {
    // SIGKILL не даёт прогону закрыть свою строку: `docker stop` по таймауту и убийство
    // по памяти оставляют её бежать вечно.
    const abandonedId = await insertRunningSyncRun('orders', new Date(Date.now() - 4 * 3_600_000));
    // А эта строка младше порога: рядом с воркером живёт разовый прогон командой,
    // и он законно идёт в момент перезапуска воркера.
    const freshId = await insertRunningSyncRun('orders', new Date(Date.now() - 60_000));

    const closed = await failAbandonedRuns(new Date(Date.now() - 3 * 3_600_000));

    expect(closed).toBe(1);

    const runs = await readSyncRuns('orders');
    const abandoned = runs.find((run) => run.id === abandonedId);
    const fresh = runs.find((run) => run.id === freshId);

    expect(abandoned?.status).toBe('failed');
    expect(abandoned?.error).toBe('прогон оборван, воркер перезапущен');
    expect(fresh?.status).toBe('running');
    expect(fresh?.error).toBeNull();
  });
});
