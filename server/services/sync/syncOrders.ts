import { consola } from 'consola';
import { createFleetClient, type FleetTransport } from '#server/adapters/fleet/client';
import {
  readOrdersByEndedAt,
  type FleetOrder,
  type OrdersWindow,
} from '#server/adapters/fleet/orders';
import { readProfileOwners } from '#server/repositories/registry';
import { finishSyncRun, startSyncRun } from '#server/repositories/syncRuns';
import { readSyncState, setSyncWatermark } from '#server/repositories/syncState';
import {
  insertTripEvents,
  upsertTripRoutePoints,
  upsertTrips,
  type TripEventInput,
  type TripInput,
  type TripRoutePointInput,
} from '#server/repositories/trips';
import { awardTripPoints, type TripAccrualSummary } from '#server/services/points/awardTripPoints';
import { buildOrdersWindow, type OrdersSyncKind } from '#server/services/sync/buildOrdersWindow';
import { readSyncConfig } from '#server/services/sync/config';

/**
 * Прогон синхронизации заказов: опрос Fleet API окном по времени завершения, запись
 * заказов и начисление баллов за завершённые.
 *
 * Один и тот же код обслуживает оба вида прогона — скользящий `orders` и догоняющий
 * `orders_catchup`. Отличаются они только окном и своей отметкой; запись и начисление
 * обязаны быть теми же, иначе однажды разойдутся.
 *
 * Что здесь принципиально:
 *
 *   - **отметка двигается только после успешного прогона.** Упавший на середине прогон
 *     отметку не трогает, и окно перечитается целиком. Именно сдвиг отметки при неуспехе
 *     породил в старом боте счётчик дней простоя и скрыл отказы по лимиту;
 *   - **отметка ставится по верхней границе окна**, а не по времени завершения последнего
 *     увиденного заказа: иначе тихий час без поездок навсегда оставил бы её в прошлом;
 *   - **начисление идёт только через сервис журнала** с ключом `trip:<order_id>`. Прямая
 *     правка баланса запрещена (docs/points.md);
 *   - **отказ по лимиту и незнакомый водитель прогон не роняют** — оба считаются
 *     счётчиком и попадают в сводку.
 */

const log = consola.withTag('sync:orders');

/** Статус заказа, за который начисляется балл. Значение из словаря Fleet API. */
const COMPLETED_STATUS = 'complete';

export type OrdersSyncStatus = 'succeeded' | 'failed' | 'skipped';

export type OrdersSyncSummary = {
  kind: OrdersSyncKind;
  status: OrdersSyncStatus;
  /** Пусто, если прогон не заводился: окно оказалось пустым. */
  runId: string | null;
  window: OrdersWindow | null;
  pages: number;
  requests: number;
  rateLimited: number;
  /** Сколько заказов вернул API — до разбора. */
  ordersSeen: number;
  /** Сколько заказов легло в `xb.trips`. */
  ordersWritten: number;
  /** Заказы, которым не хватило обязательного поля. Не записаны, потеряны из виду. */
  malformed: number;
  /** Заказы водителей, которых нет в `xb.park_profiles`. Норма до синхронизации профилей. */
  skippedUnknownProfile: number;
  /** Сколько разных водителей стоит за предыдущим счётчиком. */
  unknownProfiles: number;
  /** Значения чужих словарей, которых мы раньше не видели. Записаны текстом, ничего не сломали. */
  unknownValues: string[];
  accrual: TripAccrualSummary;
};

const emptyAccrual = (): TripAccrualSummary => ({
  requested: 0,
  awarded: 0,
  alreadyAwarded: 0,
  notCompleted: 0,
  withoutEndedAt: 0,
  outsideProgram: 0,
  unknownTrip: 0,
});

const addAccrual = (total: TripAccrualSummary, page: TripAccrualSummary): TripAccrualSummary => ({
  requested: total.requested + page.requested,
  awarded: total.awarded + page.awarded,
  alreadyAwarded: total.alreadyAwarded + page.alreadyAwarded,
  notCompleted: total.notCompleted + page.notCompleted,
  withoutEndedAt: total.withoutEndedAt + page.withoutEndedAt,
  outsideProgram: total.outsideProgram + page.outsideProgram,
  unknownTrip: total.unknownTrip + page.unknownTrip,
});

const toTripInput = (order: FleetOrder): TripInput => ({
  orderId: order.orderId,
  shortId: order.shortId,
  profileId: order.profileId,
  status: order.status,
  category: order.category,
  paymentMethod: order.paymentMethod,
  provider: order.provider,
  orderTypeId: order.orderTypeId,
  orderTypeName: order.orderTypeName,
  workRuleId: order.workRuleId,
  bookedAt: order.bookedAt,
  apiCreatedAt: order.apiCreatedAt,
  drivingAt: order.drivingAt,
  endedAt: order.endedAt,
  price: order.price,
  mileage: order.mileage,
  carId: order.carId,
  carCallsign: order.carCallsign,
  carLicenseNumber: order.carLicenseNumber,
  carBrandModel: order.carBrandModel,
  addressFromText: order.addressFromText,
  addressFromLat: order.addressFromLat,
  addressFromLon: order.addressFromLon,
  cancellationDescription: order.cancellationDescription,
  flags: order.flags,
  amenities: order.amenities,
});

type PageWriteResult = {
  written: number;
  skippedUnknownProfile: number;
  unknownProfileIds: string[];
  completedOrderIds: string[];
};

/**
 * Кладёт страницу заказов и возвращает, что с ней стало.
 *
 * Заказ водителя, которого нет в реестре парка, пропускается со счётчиком: это водитель,
 * заведённый в парке после последней синхронизации реестра, — штатная ситуация до того,
 * как синхронизация профилей появится своей задачей. Вставлять такую поездку нельзя,
 * `trips.profile_id` ссылается на `park_profiles` внешним ключом.
 */
const writePage = async (
  orders: readonly FleetOrder[],
  runId: string,
  syncedAt: Date,
): Promise<PageWriteResult> => {
  const result: PageWriteResult = {
    written: 0,
    skippedUnknownProfile: 0,
    unknownProfileIds: [],
    completedOrderIds: [],
  };

  if (orders.length === 0) {
    return result;
  }

  const knownProfiles = await readProfileOwners([...new Set(orders.map((order) => order.profileId))]);
  const unknownProfileIds = new Set<string>();
  const writable: FleetOrder[] = [];

  for (const order of orders) {
    if (knownProfiles.has(order.profileId)) {
      writable.push(order);
      continue;
    }

    result.skippedUnknownProfile += 1;
    unknownProfileIds.add(order.profileId);
  }

  result.unknownProfileIds = [...unknownProfileIds];

  if (writable.length === 0) {
    return result;
  }

  const tripIds = await upsertTrips(writable.map(toTripInput), runId, syncedAt);
  result.written = tripIds.size;

  const events: TripEventInput[] = [];
  const routePoints: TripRoutePointInput[] = [];

  for (const order of writable) {
    const tripId = tripIds.get(order.orderId);

    if (!tripId) {
      continue;
    }

    for (const event of order.events) {
      events.push({ tripId, orderStatus: event.orderStatus, eventAt: event.eventAt });
    }

    for (const point of order.routePoints) {
      routePoints.push({ tripId, seq: point.seq, address: point.address, lat: point.lat, lon: point.lon });
    }

    // Незавершённый заказ на начисление не отдаётся и обработанным не помечается: он
    // вернётся позже с временем завершения в прошлом и начислится тогда. Выборка по
    // `ended_at` таких почти не отдаёт, но «почти» здесь недостаточно.
    if (order.status === COMPLETED_STATUS) {
      result.completedOrderIds.push(order.orderId);
    }
  }

  await insertTripEvents(events);
  await upsertTripRoutePoints(routePoints);

  return result;
};

export type RunOrdersSyncOptions = {
  /** Подставляется тестами и разовым запуском. По умолчанию — настоящий клиент Fleet API. */
  client?: FleetTransport;
  now?: Date;
};

export const runOrdersSync = async (
  kind: OrdersSyncKind,
  options: RunOrdersSyncOptions = {},
): Promise<OrdersSyncSummary> => {
  const config = readSyncConfig();
  const now = options.now ?? new Date();
  const state = await readSyncState(kind);
  const window = buildOrdersWindow({ kind, watermark: state?.watermark ?? null, now, config });

  if (!window) {
    log.info('Окно пусто, прогон не заводится', { kind, watermark: state?.watermark ?? null });

    return {
      kind,
      status: 'skipped',
      runId: null,
      window: null,
      pages: 0,
      requests: 0,
      rateLimited: 0,
      ordersSeen: 0,
      ordersWritten: 0,
      malformed: 0,
      skippedUnknownProfile: 0,
      unknownProfiles: 0,
      unknownValues: [],
      accrual: emptyAccrual(),
    };
  }

  if (!state?.watermark) {
    log.warn(
      'Отметка синхронизации пуста — прогон берёт только окно перекрытия. Глубже закроет догоняющий прогон',
      { kind, endedFrom: window.endedFrom },
    );
  }

  // Клиент собирается до строки прогона: незаполненные реквизиты в окружении — это отказ
  // на старте, а не прогон, навсегда оставшийся в состоянии `running`.
  const client =
    options.client ??
    createFleetClient({
      onRateLimited: (description, attempt, waitMs) => {
        log.warn('Отказ по лимиту Fleet API', { kind, description, attempt, waitMs });
      },
    });

  const runId = await startSyncRun(kind, window.endedFrom, window.endedTo);

  const unknownValues = new Set<string>();
  const unknownProfileIds = new Set<string>();
  let pages = 0;
  let ordersSeen = 0;
  let ordersWritten = 0;
  let malformed = 0;
  let skippedUnknownProfile = 0;
  let accrual = emptyAccrual();

  try {
    for await (const page of readOrdersByEndedAt(client, window, config.pageLimit)) {
      pages += 1;
      ordersSeen += page.received;
      malformed += page.malformed;

      for (const value of page.unknownValues) {
        unknownValues.add(value);
      }

      const written = await writePage(page.orders, runId, now);
      ordersWritten += written.written;
      skippedUnknownProfile += written.skippedUnknownProfile;

      for (const profileId of written.unknownProfileIds) {
        unknownProfileIds.add(profileId);
      }

      // Начисление идёт постранично, а не в конце: у догоняющего прогона страниц полсотни,
      // и держать ради этого весь список заказов в памяти незачем. Повторный вызов
      // безопасен — идемпотентность держится ключом, а не порядком действий.
      accrual = addAccrual(accrual, await awardTripPoints(written.completedOrderIds));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stats = client.stats();

    await finishSyncRun(
      runId,
      'failed',
      {
        requests: stats.requests,
        rateLimited: stats.rateLimited,
        itemsSeen: ordersSeen,
        itemsWritten: ordersWritten,
      },
      message,
    );

    // Отметка не трогается намеренно: окно будет перечитано целиком следующим прогоном.
    log.error('Прогон синхронизации заказов упал, отметка осталась на месте', {
      kind,
      runId,
      pages,
      ordersSeen,
      ordersWritten,
      requests: stats.requests,
      rateLimited: stats.rateLimited,
      error: message,
    });

    throw error;
  }

  const stats = client.stats();

  await finishSyncRun(
    runId,
    'succeeded',
    {
      requests: stats.requests,
      rateLimited: stats.rateLimited,
      itemsSeen: ordersSeen,
      itemsWritten: ordersWritten,
    },
    null,
  );

  // Только после успеха и только по верхней границе окна.
  await setSyncWatermark(kind, window.endedTo, runId);

  const summary: OrdersSyncSummary = {
    kind,
    status: 'succeeded',
    runId,
    window,
    pages,
    requests: stats.requests,
    rateLimited: stats.rateLimited,
    ordersSeen,
    ordersWritten,
    malformed,
    skippedUnknownProfile,
    unknownProfiles: unknownProfileIds.size,
    unknownValues: [...unknownValues],
    accrual,
  };

  // Сводка одной строкой: окно, сколько заказов, сколько начислено, сколько отказов,
  // сколько пропущено и почему. Идентификаторы водителей и адреса в лог не попадают.
  log.info('Прогон синхронизации заказов завершён', {
    kind,
    runId,
    endedFrom: window.endedFrom.toISOString(),
    endedTo: window.endedTo.toISOString(),
    pages,
    requests: stats.requests,
    rateLimited: stats.rateLimited,
    ordersSeen,
    ordersWritten,
    awarded: accrual.awarded,
    alreadyAwarded: accrual.alreadyAwarded,
    outsideProgram: accrual.outsideProgram,
    notCompleted: accrual.notCompleted,
    skippedUnknownProfile,
    unknownProfiles: unknownProfileIds.size,
    malformed,
    unknownValues: summary.unknownValues,
  });

  if (summary.unknownValues.length > 0) {
    log.warn('Fleet API прислал незнакомые значения словарей — записаны текстом', {
      kind,
      unknownValues: summary.unknownValues,
    });
  }

  return summary;
};
