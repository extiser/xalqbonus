/**
 * Разовый сбор истории заказов парка по списку дат (issue #315), мимо очереди.
 *
 * Тонкая обвязка над сервисом: разбор аргументов, бюджет запросов, печать итогов.
 * Сутки обходятся по порядку, последовательно. Если сутки вернули ноль заказов, следующие
 * даты списка не запрашиваются: глубина истории найдена.
 *
 * Бюджет запросов — жёсткий: ключ парка общий с прод-синхронизацией, лимитер считает
 * стоимость на ключ. Запрос сверх бюджета не уходит, обход суток обрывается.
 *
 * Запуск: make fleet-history dates=2026-09-24,2026-07-01 [budget=60]
 */
import { consola } from 'consola';

import { createFleetClient, type FleetTransport } from '#server/adapters/fleet/client';
import { db } from '#server/db';
import {
  collectHistoryDay,
  stopOnRepeatedRateLimit,
} from '#server/services/fleetHistory/collectHistoryDay';

const log = consola.withTag('fleet-history');

const DEFAULT_BUDGET = 60;

const readDates = (): string[] => {
  const dates = (process.argv[2] ?? '')
    .split(',')
    .map((date) => date.trim())
    .filter((date) => date !== '');

  if (dates.length === 0) {
    throw new Error('не заданы даты: make fleet-history dates=2026-09-24,2026-07-01');
  }

  return dates;
};

const readBudget = (): number => {
  const raw = process.argv[3];

  if (raw === undefined || raw === '') {
    return DEFAULT_BUDGET;
  }

  const budget = Number(raw);

  if (!Number.isInteger(budget) || budget <= 0) {
    throw new Error(`budget должен быть целым положительным числом, получено «${raw}»`);
  }

  return budget;
};

/** Не пускает запрос, который вышел бы за бюджет: проверка до сети, а не после. */
const withBudget = (transport: FleetTransport, budget: number): FleetTransport => {
  const guard = (description: string): void => {
    if (transport.stats().requests >= budget) {
      throw new Error(`бюджет запросов исчерпан (${budget}) перед «${description}»`);
    }
  };

  return {
    parkId: transport.parkId,
    stats: () => transport.stats(),
    post: (path, body, description) => {
      guard(description);
      return transport.post(path, body, description);
    },
    get: (path, query, description) => {
      guard(description);
      return transport.get(path, query, description);
    },
  };
};

const main = async (): Promise<void> => {
  const dates = readDates();
  const budget = readBudget();
  const client = createFleetClient({
    onRateLimited: (description, attempt, waitMs) => {
      log.warn('429', { description, attempt, waitMs });
      stopOnRepeatedRateLimit(description, attempt);
    },
  });
  const transport = withBudget(client, budget);

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
    log.info('Запросов к Fleet за запуск', { ...client.stats(), budget });
  }
};

main()
  .catch((error: unknown) => {
    consola.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
