/**
 * Сборщик истории заказов парка: одни парковые сутки за вызов (issue #315).
 *
 * Пишет в `fleet_order_history`, а не в `trips`: запись в `trips` начисляет баллы,
 * а историю за год начислять нельзя. Баллы не начисляются, `syncOrders` и его репозитории
 * не вызываются, отметок синхронизации и `sync_skips` нет.
 *
 * Строка суток в `fleet_order_history_days` — журнал сборщика. В начале обхода она
 * заводится, только если её ещё нет, с `finished_at = null`; существующая не перезаписывается.
 * Итоги и `finished_at` пишутся в конце успешного обхода. При обрыве закрытая строка
 * остаётся как была — оборванный повтор не «раскрывает» уже пройденные сутки, — а незакрытая
 * получает частичные итоги, и следующий запуск прогона диапазона начнёт эти сутки заново.
 *
 * Темп, охрана живой синхронизации и бюджет живут не здесь, а в транспорте, который сюда
 * передают: прогон диапазона оборачивает им клиент (`collectHistoryRange.ts`, issue #317).
 */
import type { FleetTransport } from '#server/adapters/fleet/client';
import { readOrdersByEndedAt, type FleetOrder } from '#server/adapters/fleet/orders';
import {
  createFleetOrderHistoryDayIfAbsent,
  readFleetOrderHistoryDayClosed,
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

/**
 * Обход суток остановлен: журнал суток остался незакрытым.
 *
 * Исходная причина лежит в `cause`: прогон диапазона решает по ней, что делать дальше, —
 * переждать лимит, закончить по бюджету или упасть (issue #317). `written` — сколько заказов
 * обход успел записать до обрыва: они в таблице, и итог запуска обязан их считать.
 */
export class HistoryDayStoppedError extends Error {
  constructor(
    public readonly parkDay: string,
    cause: unknown,
    public readonly written: number,
  ) {
    super(`обход суток ${parkDay} остановлен: ${cause instanceof Error ? cause.message : 'неизвестный отказ'}`, {
      cause,
    });
    this.name = 'HistoryDayStoppedError';
  }
}

/** Два отказа по лимиту подряд на одном запросе: ключ сейчас не отпускает. */
export class RepeatedRateLimitError extends Error {
  constructor(description: string, attempt: number) {
    super(`${attempt} отказа по лимиту подряд на «${description}»`);
    this.name = 'RepeatedRateLimitError';
  }
}

/**
 * Для `onRateLimited` клиента: на втором отказе подряд по одному запросу бросает ошибку.
 * Бросок из обратного вызова клиента прерывает запрос — оставшиеся попытки не тратятся.
 */
export const stopOnRepeatedRateLimit = (description: string, attempt: number): void => {
  if (attempt >= RATE_LIMITED_IN_A_ROW_TO_STOP) {
    throw new RepeatedRateLimitError(description, attempt);
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

  const wasClosed = (await readFleetOrderHistoryDayClosed(parkDay)) === true;

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

  await createFleetOrderHistoryDayIfAbsent({
    parkDay,
    orders: 0,
    complete: 0,
    malformed: 0,
    pages: 0,
    rateLimited: 0,
    startedAt,
    finishedAt: null,
  });

  try {
    for await (const page of readOrdersByEndedAt(client, window, pageLimit)) {
      totals.written += await upsertFleetOrderHistory(page.orders.map(toHistoryInput));

      totals.pages += 1;
      totals.orders += page.received;
      totals.complete += page.orders.filter((order) => order.status === COMPLETED_TRIP_STATUS).length;
      totals.malformed += page.malformed;
    }
  } catch (error) {
    // Закрытую до запуска строку не трогаем. Незакрытая получает то, что успели.
    if (!wasClosed) {
      await saveDay(null);
    }

    throw new HistoryDayStoppedError(parkDayText, error, totals.written);
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
