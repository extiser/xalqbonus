/**
 * Сборщик истории заказов парка: одни сутки сбора по UTC за вызов (issue #315) — `ended_at`
 * с `D 00:00:00Z` по `D+1 00:00:00Z`, порция загрузки, а не сутки метрик.
 *
 * Пишет в `fleet_order_history`, а не в `trips`: запись в `trips` начисляет баллы,
 * а историю за год начислять нельзя. Баллы не начисляются, `syncOrders` и его репозитории
 * не вызываются, отметок синхронизации и `sync_skips` нет.
 *
 * Строка суток в `fleet_order_history_days` — журнал сборщика. В начале обхода она
 * заводится, только если её ещё нет, с `finished_at = null`; существующая не перезаписывается.
 * После каждой страницы незакрытая строка получает итоги и курсор следующей страницы — одной
 * транзакцией с заказами страницы. `finished_at` пишется в конце успешного обхода, курсор
 * при этом очищается. Закрытая строка при обрыве остаётся как была — оборванный повтор
 * не «раскрывает» уже пройденные сутки.
 *
 * Незакрытые сутки с курсором продолжаются с него и с сохранённых итогов, а не с первой
 * страницы (issue #328): лимит ключа почти целиком занят живой синхронизацией, между
 * отказами прогону достаётся несколько страниц, и обход с начала до конца суток не доходит.
 * Курсор, отвергнутый Fleet API, сбрасывает сутки на первую страницу: сколько курсор живёт,
 * Яндекс не документирует.
 *
 * Темп, охрана живой синхронизации и бюджет живут не здесь, а в транспорте, который сюда
 * передают: прогон диапазона оборачивает им клиент (`collectHistoryRange.ts`, issue #317).
 */
import { consola } from 'consola';

import { FleetApiError, type FleetTransport } from '#server/adapters/fleet/client';
import { readOrdersByEndedAt, type FleetOrder } from '#server/adapters/fleet/orders';
import {
  createFleetOrderHistoryDayIfAbsent,
  readFleetOrderHistoryDay,
  saveFleetOrderHistoryPage,
  upsertFleetOrderHistoryDay,
  type FleetOrderHistoryInput,
} from '#server/repositories/fleetOrderHistory';
import { readSyncConfig } from '#server/services/sync/config';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';

const log = consola.withTag('fleet-history');

const DAY_MS = 86_400_000;

/** Два отказа по лимиту подряд на одном запросе — обход суток останавливается. */
const RATE_LIMITED_IN_A_ROW_TO_STOP = 2;

export type HistoryDaySummary = {
  /**
   * Сутки сбора по UTC, `YYYY-MM-DD`: `ended_at` с `D 00:00:00Z` по `D+1 00:00:00Z` — порция
   * загрузки, а не сутки метрик.
   */
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
  // Окно выводится из суток и одинаково у первого обхода и у продолжения: курсор
  // привязан к выборке.
  const window = { endedFrom: parkDay, endedTo: new Date(parkDay.getTime() + DAY_MS) };
  const { pageLimit } = readSyncConfig();

  const startedAt = new Date();
  const rateLimitedBefore = client.stats().rateLimited;
  const readRateLimited = (): number => client.stats().rateLimited - rateLimitedBefore;

  const journal = await readFleetOrderHistoryDay(parkDay);
  const wasClosed = journal !== null && journal.finishedAt !== null;
  const resumeCursor = journal !== null && !wasClosed ? journal.nextCursor : null;

  // Итоги суток — сохранённые, если сутки продолжаются, иначе с нуля. `written` — счёт
  // этого вызова, а не суток.
  const totals =
    journal !== null && resumeCursor !== null
      ? { orders: journal.orders, complete: journal.complete, malformed: journal.malformed, pages: journal.pages }
      : { orders: 0, complete: 0, malformed: 0, pages: 0 };
  let cursor = resumeCursor;
  let written = 0;
  /** Страниц, записанных текущим обходом: по нулю видно, что отказ пришёл на первый запрос. */
  let pagesWalked = 0;

  const saveDay = (finishedAt: Date | null): Promise<void> =>
    upsertFleetOrderHistoryDay({
      parkDay,
      ...totals,
      rateLimited: readRateLimited(),
      startedAt,
      finishedAt,
      nextCursor: finishedAt === null ? cursor : null,
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
    nextCursor: null,
  });

  /** Обходит сутки с `cursor` и сохранённых итогов. */
  const walk = async (): Promise<void> => {
    pagesWalked = 0;
    const pages = readOrdersByEndedAt(client, window, pageLimit, {
      startCursor: cursor,
      startPage: totals.pages + 1,
    });

    for await (const page of pages) {
      const next = {
        orders: totals.orders + page.received,
        complete: totals.complete + page.orders.filter((order) => order.status === COMPLETED_TRIP_STATUS).length,
        malformed: totals.malformed + page.malformed,
        pages: totals.pages + 1,
      };

      // Итоги и курсор в памяти двигаются только после коммита: обрыв на записи оставляет
      // их на последней записанной странице.
      written += await saveFleetOrderHistoryPage(page.orders.map(toHistoryInput), {
        parkDay,
        ...next,
        rateLimited: readRateLimited(),
        startedAt,
        nextCursor: page.cursor,
      });

      Object.assign(totals, next);
      cursor = page.cursor;
      pagesWalked += 1;
    }
  };

  if (resumeCursor !== null) {
    log.info('Сутки продолжены', { parkDay: parkDayText, page: totals.pages + 1, ...totals });
  }

  try {
    try {
      await walk();
    } catch (error) {
      // Отвергнут именно сохранённый курсор: отказ пришёл на первый же запрос продолжения.
      // Отказ дальше по обходу — на свежем курсоре, и он уходит наверх как прежде.
      if (!(resumeCursor !== null && pagesWalked === 0 && error instanceof FleetApiError)) {
        throw error;
      }

      log.warn('Курсор суток отвергнут, сутки начинаются с первой страницы', {
        parkDay: parkDayText,
        page: totals.pages + 1,
        status: error.status,
        code: error.code,
      });

      Object.assign(totals, { orders: 0, complete: 0, malformed: 0, pages: 0 });
      cursor = null;
      await saveDay(null);

      await walk();
    }
  } catch (error) {
    // Закрытую до запуска строку не трогаем. Незакрытая уже несёт итоги и курсор последней
    // записанной страницы; здесь дописывается счёт отказов по лимиту.
    if (!wasClosed) {
      await saveDay(null);
    }

    throw new HistoryDayStoppedError(parkDayText, error, written);
  }

  const finishedAt = new Date();
  await saveDay(finishedAt);

  return {
    parkDay: parkDayText,
    ...totals,
    rateLimited: readRateLimited(),
    written,
    startedAt,
    finishedAt,
  };
};
