/**
 * Сборщик истории заказов парка: одни парковые сутки за вызов (issue #315).
 *
 * Пишет в `fleet_order_history`, а не в `trips`: запись в `trips` начисляет баллы,
 * а историю за год начислять нельзя. Баллы не начисляются, `syncOrders` и его репозитории
 * не вызываются, отметок синхронизации и `sync_skips` нет.
 *
 * Строка суток в `fleet_order_history_days` — журнал сборщика: пишется в начале с
 * `finished_at = null` и закрывается итогами в конце. Оборванный обход оставляет её
 * незакрытой, и следующий issue продолжит полный прогон с этого места.
 */
import type { FleetTransport } from '#server/adapters/fleet/client';
import { readOrdersByEndedAt, type FleetOrder } from '#server/adapters/fleet/orders';
import {
  upsertFleetOrderHistory,
  upsertFleetOrderHistoryDay,
  type FleetOrderHistoryInput,
} from '#server/repositories/fleetOrderHistory';
import { readSyncConfig } from '#server/services/sync/config';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';

const DAY_MS = 86_400_000;

/** Два отказа по лимиту подряд на одном запросе — обход суток останавливается. */
const RATE_LIMITED_IN_A_ROW_TO_STOP = 2;

export type HistoryDaySummary = {
  /** Парковые сутки: `YYYY-MM-DD`, `ended_at` с `D 00:00:00Z` по `D+1 00:00:00Z`. */
  parkDay: string;
  orders: number;
  complete: number;
  malformed: number;
  pages: number;
  rateLimited: number;
  /** Сколько заказов записано (вставлено или обновлено). */
  written: number;
  startedAt: Date;
  finishedAt: Date;
};

/** Обход суток остановлен по правилу пробы, а не поломкой: журнал суток остался незакрытым. */
export class HistoryDayStoppedError extends Error {
  constructor(
    public readonly parkDay: string,
    reason: string,
  ) {
    super(`обход суток ${parkDay} остановлен: ${reason}`);
    this.name = 'HistoryDayStoppedError';
  }
}

/**
 * Для `onRateLimited` клиента: на втором отказе подряд по одному запросу бросает ошибку.
 * Бросок из обратного вызова клиента прерывает запрос — оставшиеся попытки не тратятся.
 */
export const stopOnRepeatedRateLimit = (description: string, attempt: number): void => {
  if (attempt >= RATE_LIMITED_IN_A_ROW_TO_STOP) {
    throw new Error(`${attempt} отказа по лимиту подряд на «${description}»`);
  }
};

const PARK_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const parseParkDay = (value: string): Date => {
  const parsed = new Date(`${value}T00:00:00Z`);

  if (!PARK_DAY_PATTERN.test(value) || Number.isNaN(parsed.getTime())) {
    throw new Error(`дата должна быть в виде ГГГГ-ММ-ДД, получено «${value}»`);
  }

  return parsed;
};

const toHistoryInput = (order: FleetOrder): FleetOrderHistoryInput => ({
  orderId: order.orderId,
  profileId: order.profileId,
  status: order.status,
  category: order.category,
  paymentMethod: order.paymentMethod,
  workRuleId: order.workRuleId,
  bookedAt: order.bookedAt,
  endedAt: order.endedAt,
  price: order.price,
  carCallsign: order.carCallsign,
});

export const collectHistoryDay = async (
  client: FleetTransport,
  parkDayText: string,
): Promise<HistoryDaySummary> => {
  const parkDay = parseParkDay(parkDayText);
  const window = { endedFrom: parkDay, endedTo: new Date(parkDay.getTime() + DAY_MS) };
  const { pageLimit } = readSyncConfig();

  const startedAt = new Date();
  const rateLimitedBefore = client.stats().rateLimited;
  const totals = { orders: 0, complete: 0, malformed: 0, pages: 0, written: 0 };

  const saveDay = (finishedAt: Date | null): Promise<void> =>
    upsertFleetOrderHistoryDay({
      parkDay,
      orders: totals.orders,
      complete: totals.complete,
      malformed: totals.malformed,
      pages: totals.pages,
      rateLimited: client.stats().rateLimited - rateLimitedBefore,
      startedAt,
      finishedAt,
    });

  await saveDay(null);

  try {
    for await (const page of readOrdersByEndedAt(client, window, pageLimit)) {
      totals.written += await upsertFleetOrderHistory(page.orders.map(toHistoryInput));

      totals.pages += 1;
      totals.orders += page.received;
      totals.complete += page.orders.filter((order) => order.status === COMPLETED_TRIP_STATUS).length;
      totals.malformed += page.malformed;
    }
  } catch (error) {
    // Что успели — фиксируем в журнале, строка остаётся незакрытой: обход прервался.
    await saveDay(null);
    throw new HistoryDayStoppedError(
      parkDayText,
      error instanceof Error ? error.message : 'неизвестный отказ',
    );
  }

  const finishedAt = new Date();
  await saveDay(finishedAt);

  return {
    parkDay: parkDayText,
    ...totals,
    rateLimited: client.stats().rateLimited - rateLimitedBefore,
    startedAt,
    finishedAt,
  };
};
