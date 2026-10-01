import type { FleetRequestStats, FleetTransport } from '#server/adapters/fleet/client';

/**
 * Жёсткий бюджет запросов к Fleet API на запуск сборщика истории.
 *
 * Ключ парка общий с прод-синхронизацией, лимитер считает стоимость на ключ. Запрос сверх
 * бюджета не уходит: проверка до сети, а не после.
 *
 * Бюджет один на весь запуск, а клиентов в прогоне диапазона много — по клиенту на сутки,
 * чтобы пауза, выросшая после 429, не тянулась на весь прогон (issue #317). Поэтому счёт
 * ведётся по сумме счётчиков всех клиентов, пропущенных через бюджет.
 */

export class RequestBudgetExhaustedError extends Error {
  constructor(
    public readonly budget: number,
    description: string,
  ) {
    super(`бюджет запросов исчерпан (${budget}) перед «${description}»`);
    this.name = 'RequestBudgetExhaustedError';
  }
}

export type RequestBudget = {
  readonly limit: number;
  /** Оборачивает транспорт: его запросы идут в общий счёт и упираются в общий потолок. */
  wrap(transport: FleetTransport): FleetTransport;
  /** Сумма счётчиков всех обёрнутых транспортов. */
  stats(): FleetRequestStats;
};

export const createRequestBudget = (limit: number): RequestBudget => {
  const tracked: FleetTransport[] = [];

  const stats = (): FleetRequestStats =>
    tracked.reduce(
      (total, transport) => {
        const current = transport.stats();

        return {
          requests: total.requests + current.requests,
          rateLimited: total.rateLimited + current.rateLimited,
          waitedMs: total.waitedMs + current.waitedMs,
        };
      },
      { requests: 0, rateLimited: 0, waitedMs: 0 },
    );

  const guard = (description: string): void => {
    if (stats().requests >= limit) {
      throw new RequestBudgetExhaustedError(limit, description);
    }
  };

  return {
    limit,
    stats,
    wrap: (transport) => {
      tracked.push(transport);

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
    },
  };
};
