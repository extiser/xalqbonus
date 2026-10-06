/**
 * Сборщик истории транзакций парка: одни сутки сбора по UTC за вызов (issue #358) — `event_at`
 * с `D 00:00:00Z` по `D+1 00:00:00Z`, порция загрузки, а не сутки метрик. Включает ли Fleet
 * правую границу, не проверено: повтор на стыке снимается ключом `id`.
 *
 * Повторяет `collectHistoryDay` истории заказов. Строка суток в `fleet_transaction_days` —
 * журнал сборщика: в начале обхода она заводится, только если её ещё нет, с `finished_at = null`.
 * После каждой страницы незакрытая строка получает итоги и курсор следующей страницы — одной
 * транзакцией базы с транзакциями страницы. `finished_at` пишется в конце успешного обхода,
 * курсор при этом очищается. Закрытая строка при обрыве остаётся как была.
 *
 * Незакрытые сутки с курсором продолжаются с него и с сохранённых итогов. Курсор, отвергнутый
 * Fleet API, сбрасывает сутки на первую страницу: сколько курсор живёт, Яндекс не документирует.
 *
 * Темп, охрана живой синхронизации и бюджет живут не здесь, а в транспорте, который сюда
 * передают (`collectTransactionRange.ts`).
 */
import { consola } from 'consola';

import { FleetApiError, type FleetTransport } from '#server/adapters/fleet/client';
import { readTransactionsByEventAt, type FleetTransaction } from '#server/adapters/fleet/transactions';
import {
  createFleetTransactionDayIfAbsent,
  readFleetTransactionDay,
  saveFleetTransactionPage,
  upsertFleetTransactionDay,
} from '#server/repositories/fleetTransactions';
import { parseParkDay } from '#server/services/fleetHistory/collectHistoryDay';
import { reportPageProblems, toTransactionInput } from '#server/services/fleetTransactions/transactionPages';

const log = consola.withTag('fleet-transactions');

const DAY_MS = 86_400_000;

export type TransactionDaySummary = {
  /** Сутки сбора по UTC, `YYYY-MM-DD`. */
  parkDay: string;
  transactions: number;
  malformed: number;
  pages: number;
  rateLimited: number;
  /** Сколько транзакций записано этим вызовом (вставлено или обновлено). */
  written: number;
  /** Записанных этим вызовом без `created_by.identity` или `currency_code`. */
  incomplete: number;
  startedAt: Date;
  finishedAt: Date;
};

/**
 * Обход суток остановлен: журнал суток остался незакрытым.
 *
 * Исходная причина лежит в `cause`: прогон диапазона решает по ней, что делать дальше.
 * `written` и `incomplete` — счёт вызова до обрыва: записанное уже в таблице.
 */
export class TransactionDayStoppedError extends Error {
  constructor(
    public readonly parkDay: string,
    cause: unknown,
    public readonly written: number,
    public readonly incomplete: number,
  ) {
    super(`обход суток ${parkDay} остановлен: ${cause instanceof Error ? cause.message : 'неизвестный отказ'}`, {
      cause,
    });
    this.name = 'TransactionDayStoppedError';
  }
}

export type CollectTransactionDayOptions = {
  /** Смотрит транзакции каждой страницы до записи: прогон замечает незнакомые категории. */
  onTransactions?: (transactions: readonly FleetTransaction[]) => void;
};

export const collectTransactionDay = async (
  client: FleetTransport,
  parkDayText: string,
  options: CollectTransactionDayOptions = {},
): Promise<TransactionDaySummary> => {
  const parkDay = parseParkDay(parkDayText);
  // Окно выводится из суток и одинаково у первого обхода и у продолжения: курсор
  // привязан к выборке.
  const window = { eventFrom: parkDay, eventTo: new Date(parkDay.getTime() + DAY_MS) };

  const startedAt = new Date();
  const rateLimitedBefore = client.stats().rateLimited;
  const readRateLimited = (): number => client.stats().rateLimited - rateLimitedBefore;

  const journal = await readFleetTransactionDay(parkDay);
  const wasClosed = journal !== null && journal.finishedAt !== null;
  const resumeCursor = journal !== null && !wasClosed ? journal.nextCursor : null;

  // Итоги суток — сохранённые, если сутки продолжаются, иначе с нуля. `written`
  // и `incomplete` — счёт этого вызова, а не суток.
  const totals =
    journal !== null && resumeCursor !== null
      ? { transactions: journal.transactions, malformed: journal.malformed, pages: journal.pages }
      : { transactions: 0, malformed: 0, pages: 0 };
  let cursor = resumeCursor;
  let written = 0;
  let incomplete = 0;
  /** Страниц, записанных текущим обходом: по нулю видно, что отказ пришёл на первый запрос. */
  let pagesWalked = 0;

  const saveDay = (finishedAt: Date | null): Promise<void> =>
    upsertFleetTransactionDay({
      parkDay,
      ...totals,
      rateLimited: readRateLimited(),
      startedAt,
      finishedAt,
      nextCursor: finishedAt === null ? cursor : null,
    });

  await createFleetTransactionDayIfAbsent({
    parkDay,
    transactions: 0,
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
    const pages = readTransactionsByEventAt(client, window, {
      startCursor: cursor,
      startPage: totals.pages + 1,
    });

    for await (const page of pages) {
      const next = {
        transactions: totals.transactions + page.received,
        malformed: totals.malformed + page.malformed,
        pages: totals.pages + 1,
      };

      reportPageProblems(log, page, { parkDay: parkDayText, page: next.pages });
      options.onTransactions?.(page.transactions);

      // Итоги и курсор в памяти двигаются только после коммита: обрыв на записи оставляет
      // их на последней записанной странице.
      written += await saveFleetTransactionPage(page.transactions.map(toTransactionInput), {
        parkDay,
        ...next,
        rateLimited: readRateLimited(),
        startedAt,
        nextCursor: page.cursor,
      });

      incomplete += page.incomplete.length;
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

      Object.assign(totals, { transactions: 0, malformed: 0, pages: 0 });
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

    throw new TransactionDayStoppedError(parkDayText, error, written, incomplete);
  }

  const finishedAt = new Date();
  await saveDay(finishedAt);

  return {
    parkDay: parkDayText,
    ...totals,
    rateLimited: readRateLimited(),
    written,
    incomplete,
    startedAt,
    finishedAt,
  };
};
