import { consola } from 'consola';
import { createFleetClient, type FleetTransport } from '#server/adapters/fleet/client';
import {
  readOrdersByEndedAt,
  type FleetOrder,
  type MalformedOrder,
  type OrdersWindow,
} from '#server/adapters/fleet/orders';
import { readProfileOwners } from '#server/repositories/registry';
import { saveSyncRunOrders, type SyncRunOrdersCounters } from '#server/repositories/syncRunOrders';
import { finishSyncRun, startSyncRun } from '#server/repositories/syncRuns';
import { recordSyncSkips, resolveSyncSkips, type SyncSkipInput } from '#server/repositories/syncSkips';
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
import { buildOrdersWindow } from '#server/services/sync/buildOrdersWindow';
import {
  readSyncConfig,
  staleWatermarkThresholdMs,
  type OrdersSyncKind,
  type SyncConfig,
} from '#server/services/sync/config';

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

/**
 * Сколько идентификаторов пропущенного показывать в сводке.
 *
 * Ограничение лога и только лога: сводка — одна строка, и дамп на полтысячи
 * идентификаторов её убивает. В `xb.sync_skips` едет всё до единого, поимённо и без
 * обрезки, — то, что за пятидесятым, иначе не было бы названо нигде и никогда.
 */
const SAMPLE_LIMIT = 50;

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
  /** Сколько строк `xb.trips` тронуто: вставленные плюс обновлённые. Уходит в `items_written`. */
  ordersWritten: number;
  /** Из них появились в базе впервые. */
  ordersInserted: number;
  /** Из них уже были: перекрытие окон приносит одни и те же заказы каждый прогон. */
  ordersUpdated: number;
  /** Заказы, которым не хватило обязательного поля. Не записаны, потеряны из виду. */
  malformed: number;
  /**
   * Кто именно не разобрался — до `SAMPLE_LIMIT` записей.
   *
   * Прогон при этом успешен, и отметка встаёт на верхнюю границу окна: заново эти заказы
   * запросит только догоняющий прогон, и только пока они не старше его окна. Дальше достать
   * их можно лишь перепроверкой прошлого, и знать, какие именно, к тому моменту неоткуда.
   */
  malformedIds: MalformedOrder[];
  /** Заказы водителей, которых нет в `xb.park_profiles`. Норма до синхронизации профилей. */
  skippedUnknownProfile: number;
  /** Сколько разных водителей стоит за предыдущим счётчиком. */
  unknownProfiles: number;
  /** Какие именно профили — до `SAMPLE_LIMIT` штук. По ним заказы и достаются обратно. */
  unknownProfileIds: string[];
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

/**
 * Жалуется в лог, если отметка застряла.
 *
 * Опасен вырожденный случай: если падать начнёт каждый прогон — например, лимит ключа
 * перестанет отпускать вовсе, — отметка не сдвинется никогда. Прогоны при этом идут минута
 * за минутой, строки в `sync_runs` появляются, воркер жив, логи пишутся, а баллы
 * не начисляются вовсе. Это ровно то состояние, в котором годами жил старый бот: система
 * выглядит работающей.
 *
 * Заметить это по одному прогону нельзя — каждый из них выглядит нормальным. Видно только
 * по расстоянию между отметкой и текущим моментом, и здесь оно и меряется. Экран
 * наблюдаемости придёт своим этапом, а до тех пор это единственный дешёвый детектор.
 */
const warnIfWatermarkStale = (
  kind: OrdersSyncKind,
  watermark: Date | null,
  now: Date,
  config: SyncConfig,
): void => {
  if (!watermark) {
    return;
  }

  const lagMs = now.getTime() - watermark.getTime();
  const thresholdMs = staleWatermarkThresholdMs(kind, config);

  if (lagMs <= thresholdMs) {
    return;
  }

  log.warn('Отметка синхронизации отстала — окно не движется, а прогоны идут', {
    kind,
    watermark: watermark.toISOString(),
    lagMinutes: Math.round(lagMs / 60_000),
    thresholdMinutes: Math.round(thresholdMs / 60_000),
  });
};

/**
 * Незнакомое значение чужого словаря приходит от адаптера строкой `словарь=значение`.
 * В журнале они разъезжаются по колонкам: значение — ссылка, словарь — деталь, — иначе
 * «в каком словаре расширение» пришлось бы доставать разбором строки в каждом запросе.
 */
const toUnknownValueSkip = (unknownValue: string): SyncSkipInput => {
  const separator = unknownValue.indexOf('=');

  if (separator < 0) {
    return { reason: 'unknown_value', reference: unknownValue, detail: null };
  }

  return {
    reason: 'unknown_value',
    reference: unknownValue.slice(separator + 1),
    detail: unknownValue.slice(0, separator),
  };
};

type SkippedOrder = {
  orderId: string;
  profileId: string;
};

type PageWriteResult = {
  inserted: number;
  updated: number;
  /** Заказы, чей водитель не нашёлся в реестре, — парами, а не счётчиком. */
  skippedUnknownProfile: SkippedOrder[];
  /** Заказы, доехавшие до `xb.trips`. По ним закрывается ранее пропущенное. */
  writtenOrderIds: string[];
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
    inserted: 0,
    updated: 0,
    skippedUnknownProfile: [],
    writtenOrderIds: [],
    completedOrderIds: [],
  };

  if (orders.length === 0) {
    return result;
  }

  const knownProfiles = await readProfileOwners([...new Set(orders.map((order) => order.profileId))]);
  const writable: FleetOrder[] = [];

  for (const order of orders) {
    if (knownProfiles.has(order.profileId)) {
      writable.push(order);
      continue;
    }

    result.skippedUnknownProfile.push({ orderId: order.orderId, profileId: order.profileId });
  }

  if (writable.length === 0) {
    return result;
  }

  const tripIds = await upsertTrips(writable.map(toTripInput), runId, syncedAt);

  for (const [orderId, written] of tripIds) {
    result.writtenOrderIds.push(orderId);

    if (written.inserted) {
      result.inserted += 1;
    } else {
      result.updated += 1;
    }
  }

  const events: TripEventInput[] = [];
  const routePoints: TripRoutePointInput[] = [];

  for (const order of writable) {
    const tripId = tripIds.get(order.orderId)?.tripId;

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
      ordersInserted: 0,
      ordersUpdated: 0,
      malformed: 0,
      malformedIds: [],
      skippedUnknownProfile: 0,
      unknownProfiles: 0,
      unknownProfileIds: [],
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

  warnIfWatermarkStale(kind, state?.watermark ?? null, now, config);

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
  const malformedIds: MalformedOrder[] = [];
  let pages = 0;
  let ordersSeen = 0;
  let ordersInserted = 0;
  let ordersUpdated = 0;
  let malformed = 0;
  let skippedUnknownProfile = 0;
  let accrual = emptyAccrual();

  /** Снимок счётчиков прогона на этот момент. Кладётся в базу на любом исходе. */
  const runDetails = (): SyncRunOrdersCounters => ({
    pages,
    ordersInserted,
    ordersUpdated,
    malformed,
    skippedUnknownProfile,
    unknownProfiles: unknownProfileIds.size,
    awarded: accrual.awarded,
    alreadyAwarded: accrual.alreadyAwarded,
    notCompleted: accrual.notCompleted,
    withoutEndedAt: accrual.withoutEndedAt,
    outsideProgram: accrual.outsideProgram,
    unknownTrip: accrual.unknownTrip,
  });

  try {
    for await (const page of readOrdersByEndedAt(client, window, config.pageLimit)) {
      pages += 1;
      ordersSeen += page.received;
      malformed += page.malformed;
      // Копим только до потолка: счётчик `malformed` считает всё, а список нужен как
      // образец — страница, не разобравшаяся целиком, не должна раздувать память прогона.
      if (malformedIds.length < SAMPLE_LIMIT) {
        malformedIds.push(...page.malformedIds.slice(0, SAMPLE_LIMIT - malformedIds.length));
      }

      // Каждый неразобранный заказ — своей строкой в журнал пропущенного, без обрезки:
      // `SAMPLE_LIMIT` выше режет образец для лога, а не то, что доезжает до базы.
      const pageSkips: SyncSkipInput[] = page.malformedIds.map((order) => ({
        reason: 'malformed',
        reference: order.orderId,
        detail: order.field,
      }));

      // Незнакомое значение словаря пишется раз на прогон, а не раз на страницу: иначе
      // `times_seen` считал бы страницы, а читается он как «столько прогонов принесли это».
      for (const value of page.unknownValues) {
        if (unknownValues.has(value)) {
          continue;
        }

        unknownValues.add(value);
        pageSkips.push(toUnknownValueSkip(value));
      }

      const written = await writePage(page.orders, runId, now);
      ordersInserted += written.inserted;
      ordersUpdated += written.updated;
      skippedUnknownProfile += written.skippedUnknownProfile.length;

      for (const skipped of written.skippedUnknownProfile) {
        unknownProfileIds.add(skipped.profileId);
        pageSkips.push({
          reason: 'unknown_profile',
          reference: skipped.orderId,
          detail: skipped.profileId,
        });
      }

      // Пропущенное кладётся постранично, а не в конце прогона: у прогона, упавшего
      // на середине, то, что он успел увидеть, остаётся в базе. Ради этого же и порядок:
      // сначала запись пропущенного, потом закрытие того, что наконец записалось.
      await recordSyncSkips(runId, pageSkips);
      await resolveSyncSkips(written.writtenOrderIds);

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
        itemsWritten: ordersInserted + ordersUpdated,
      },
      message,
    );

    // Детали пишутся и у упавшего прогона — у него они и важнее всего: сколько он успел
    // разобрать и начислить до обрыва. Но после закрытия строки, а не до: отказ на записи
    // деталей иначе заменил бы собой настоящую ошибку и оставил прогон бежать вечно.
    await saveSyncRunOrders(runId, runDetails());

    // Отметка не трогается намеренно: окно будет перечитано целиком следующим прогоном.
    log.error('Прогон синхронизации заказов упал, отметка осталась на месте', {
      kind,
      runId,
      pages,
      ordersSeen,
      ordersWritten: ordersInserted + ordersUpdated,
      requests: stats.requests,
      rateLimited: stats.rateLimited,
      error: message,
    });

    throw error;
  }

  const stats = client.stats();

  // До закрытия строки: успешным прогон объявляется тогда, когда его детали уже в базе,
  // а не тогда, когда их ещё предстоит записать.
  await saveSyncRunOrders(runId, runDetails());

  await finishSyncRun(
    runId,
    'succeeded',
    {
      requests: stats.requests,
      rateLimited: stats.rateLimited,
      itemsSeen: ordersSeen,
      itemsWritten: ordersInserted + ordersUpdated,
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
    ordersWritten: ordersInserted + ordersUpdated,
    ordersInserted,
    ordersUpdated,
    malformed,
    malformedIds,
    skippedUnknownProfile,
    unknownProfiles: unknownProfileIds.size,
    unknownProfileIds: [...unknownProfileIds].slice(0, SAMPLE_LIMIT),
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
    ordersInserted,
    ordersUpdated,
    awarded: accrual.awarded,
    alreadyAwarded: accrual.alreadyAwarded,
    outsideProgram: accrual.outsideProgram,
    notCompleted: accrual.notCompleted,
    skippedUnknownProfile,
    unknownProfiles: unknownProfileIds.size,
    malformed,
    unknownValues: summary.unknownValues,
    // Пропущенное называется поимённо. Идентификаторы заказа и профиля персональными
    // данными не являются — в отличие от адресов, телефонов и имён, которых в логе нет.
    malformedIds: summary.malformedIds,
    malformedIdsHidden: malformed - summary.malformedIds.length,
    unknownProfileIds: summary.unknownProfileIds,
    unknownProfileIdsHidden: unknownProfileIds.size - summary.unknownProfileIds.length,
  });

  if (summary.unknownValues.length > 0) {
    log.warn('Fleet API прислал незнакомые значения словарей — записаны текстом', {
      kind,
      unknownValues: summary.unknownValues,
    });
  }

  return summary;
};
