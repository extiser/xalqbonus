/**
 * Сбор истории заказов парка мимо очереди (issues #315, #317).
 *
 * Тонкая обвязка над сервисом: разбор аргументов, сигналы, печать итогов. Два режима:
 *
 *   - список дат (`dates=`) — проба глубины: сутки по порядку, и если сутки вернули ноль
 *     заказов, следующие даты не запрашиваются — глубина найдена;
 *   - диапазон (`from= to= budget=`) — полный прогон от старых суток к новым, с паузой между
 *     страницами, охраной живой синхронизации и продолжением с места
 *     (`server/services/fleetHistory/collectHistoryRange.ts`).
 *
 * Бюджет запросов жёсткий в обоих режимах: ключ парка общий с прод-синхронизацией. В режиме
 * диапазона он обязателен.
 *
 * SIGTERM и SIGINT — штатная остановка: очередная страница не запрашивается, итог печатается.
 * Повтор той же команды добирает незакрытые сутки.
 *
 * Запуск:
 *   make fleet-history dates=2026-09-24,2026-07-01 [budget=60]
 *   make fleet-history from=2025-08-01 to=2026-09-30 budget=500 [pause=5] [cooldown=10]
 */
import { consola } from 'consola';

import { createFleetClient } from '#server/adapters/fleet/client';
import { db } from '#server/db';
import { collectHistoryDay, stopOnRepeatedRateLimit } from '#server/services/fleetHistory/collectHistoryDay';
import {
  collectHistoryRange,
  HistoryRangeFailedError,
  type HistoryRangeSummary,
} from '#server/services/fleetHistory/collectHistoryRange';
import { createRequestBudget } from '#server/services/fleetHistory/requestBudget';

const log = consola.withTag('fleet-history');

const USAGE =
  'fleet-history: укажите dates=ГГГГ-ММ-ДД,… [budget=60] или from=ГГГГ-ММ-ДД to=ГГГГ-ММ-ДД budget=N [pause=5] [cooldown=10]';

const DEFAULT_LIST_BUDGET = 60;
const DEFAULT_PAUSE_SEC = 5;
const DEFAULT_COOLDOWN_MIN = 10;

const KNOWN_ARGUMENTS = ['dates', 'from', 'to', 'budget', 'pause', 'cooldown'] as const;

type ArgumentName = (typeof KNOWN_ARGUMENTS)[number];

/** Аргументы вида `имя=значение`. Пустое значение — то же, что отсутствие: так их передаёт Makefile. */
const readArguments = (): Partial<Record<ArgumentName, string>> => {
  const parsed: Partial<Record<ArgumentName, string>> = {};

  for (const argument of process.argv.slice(2)) {
    const separator = argument.indexOf('=');
    const name = argument.slice(0, separator);
    const value = argument.slice(separator + 1).trim();

    if (separator <= 0 || !(KNOWN_ARGUMENTS as readonly string[]).includes(name)) {
      throw new Error(`непонятный аргумент «${argument}». ${USAGE}`);
    }

    if (value !== '') {
      parsed[name as ArgumentName] = value;
    }
  }

  return parsed;
};

const readPositiveInteger = (name: string, raw: string): number => {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} должен быть целым положительным числом, получено «${raw}»`);
  }

  return value;
};

const readNonNegativeNumber = (name: string, raw: string): number => {
  const value = Number(raw);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} должен быть неотрицательным числом, получено «${raw}»`);
  }

  return value;
};

const createHistoryClient = () =>
  createFleetClient({
    onRateLimited: (description, attempt, waitMs) => {
      log.warn('429', { description, attempt, waitMs });
      stopOnRepeatedRateLimit(description, attempt);
    },
  });

const runList = async (datesText: string, budgetText: string | undefined): Promise<void> => {
  const dates = datesText
    .split(',')
    .map((date) => date.trim())
    .filter((date) => date !== '');
  const budget = createRequestBudget(
    budgetText === undefined ? DEFAULT_LIST_BUDGET : readPositiveInteger('budget', budgetText),
  );
  const transport = budget.wrap(createHistoryClient());

  try {
    for (const date of dates) {
      const started = Date.now();
      const summary = await collectHistoryDay(transport, date);

      log.info('Сутки обойдены', {
        parkDay: summary.parkDay,
        orders: summary.orders,
        complete: summary.complete,
        malformed: summary.malformed,
        pages: summary.pages,
        rateLimited: summary.rateLimited,
        written: summary.written,
        durationSec: Math.round((Date.now() - started) / 1_000),
      });

      if (summary.orders === 0) {
        log.info('Сутки пусты — глубина найдена, остальные даты не запрашиваются', { parkDay: date });
        break;
      }
    }
  } finally {
    log.info('Запросов к Fleet за запуск', { ...budget.stats(), budget: budget.limit });
  }
};

const toMinutes = (milliseconds: number): number => Math.round(milliseconds / 6_000) / 10;

const printRangeSummary = (summary: HistoryRangeSummary, budget: number): void => {
  log.info('Итог запуска', {
    stoppedBy: summary.stoppedBy,
    daysCollected: summary.daysCollected,
    daysSkippedClosed: summary.daysSkippedClosed,
    daysLeftOpen: summary.daysLeftOpen.length === 0 ? 'нет' : summary.daysLeftOpen.join(', '),
    daysNotReached: summary.daysNotReached,
    requests: summary.requests,
    budget,
    rateLimited: summary.rateLimited,
    waitedCatchupMin: toMinutes(summary.waitedCatchupMs),
    waitedFailedOrdersMin: toMinutes(summary.waitedFailedOrdersMs),
    waitedRateLimitCooldownMin: toMinutes(summary.waitedRateLimitCooldownMs),
    ordersWritten: summary.ordersWritten,
  });
};

const runRange = async (
  from: string,
  to: string | undefined,
  options: Partial<Record<ArgumentName, string>>,
): Promise<void> => {
  if (to === undefined) {
    throw new Error(`не задан to=. ${USAGE}`);
  }

  if (options.budget === undefined) {
    throw new Error(`в режиме диапазона budget= обязателен. ${USAGE}`);
  }

  const budget = readPositiveInteger('budget', options.budget);
  const pauseSec = options.pause === undefined ? DEFAULT_PAUSE_SEC : readNonNegativeNumber('pause', options.pause);
  const cooldownMin =
    options.cooldown === undefined ? DEFAULT_COOLDOWN_MIN : readNonNegativeNumber('cooldown', options.cooldown);

  const stop = new AbortController();
  const onSignal = (signalName: NodeJS.Signals): void => {
    if (stop.signal.aborted) {
      return;
    }

    log.warn(`Получен ${signalName}: штатная остановка после текущего запроса`);
    stop.abort();
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);

  log.info('Прогон диапазона', { from, to, budget, pauseSec, cooldownMin });

  try {
    const summary = await collectHistoryRange({
      from,
      to,
      budget,
      pauseMs: pauseSec * 1_000,
      cooldownMs: cooldownMin * 60_000,
      createClient: createHistoryClient,
      signal: stop.signal,
    });

    printRangeSummary(summary, budget);
  } catch (error) {
    if (error instanceof HistoryRangeFailedError) {
      printRangeSummary(error.summary, budget);
    }

    throw error;
  }
};

const main = async (): Promise<void> => {
  const options = readArguments();

  if (options.dates !== undefined && options.from !== undefined) {
    throw new Error(`dates= и from= вместе не задаются. ${USAGE}`);
  }

  if (options.dates !== undefined) {
    await runList(options.dates, options.budget);
    return;
  }

  if (options.from !== undefined) {
    await runRange(options.from, options.to, options);
    return;
  }

  throw new Error(USAGE);
};

main()
  .catch((error: unknown) => {
    consola.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
