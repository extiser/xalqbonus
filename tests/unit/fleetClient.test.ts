import { afterEach, describe, expect, it, vi } from 'vitest';

import { FleetApiError, FleetClient, FleetRateLimitError } from '#server/adapters/fleet/client';

/**
 * Транспорт к Fleet API.
 *
 * Проверяется поведение на отказах: что повторяется, что нет и что попадает в счётчики.
 * Пауза подменена — отступление, проверяемое честным сном на минуту, это не проверка,
 * а ожидание.
 */

const credentials = {
  baseUrl: 'https://fleet-api.example',
  clientId: 'client',
  apiKey: 'key',
  parkId: 'park',
};

/** Ответы, которые отдаст подменённый `fetch`, по одному на попытку. */
const stubFetch = (responses: readonly Response[]): void => {
  let issued = 0;

  vi.stubGlobal('fetch', async () => {
    const response = responses[issued] ?? responses[responses.length - 1];
    issued += 1;

    return response as Response;
  });
};

const jsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });

/** Прокси, отдавший страницу с кодом 200 вместо ответа API. */
const htmlResponse = (): Response =>
  new Response('<html>502 Bad Gateway</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });

const createClient = (): FleetClient =>
  new FleetClient(credentials, { sleep: async () => {} });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('транспорт Fleet API', () => {
  it('ответ 200, не разобравшийся как JSON, повторяется, а не роняет прогон', async () => {
    stubFetch([htmlResponse(), jsonResponse({ orders: [] })]);
    const client = createClient();

    const payload = await client.post<{ orders: unknown[] }>('/v1/parks/orders/list', {}, 'заказы');

    expect(payload.orders).toEqual([]);
    // Две попытки, и ни одна из них не отказ по лимиту: у заминки прокси свой счётчик нет,
    // но и в чужой она попадать не должна.
    expect(client.stats().requests).toBe(2);
    expect(client.stats().rateLimited).toBe(0);
  });

  it('отказ по лимиту повторяется тем же запросом и считается', async () => {
    stubFetch([new Response('Limit exceeded.', { status: 429 }), jsonResponse({ orders: [] })]);
    const client = createClient();

    await client.post('/v1/parks/orders/list', {}, 'заказы');

    expect(client.stats().requests).toBe(2);
    expect(client.stats().rateLimited).toBe(1);
  });

  it('когда попытки кончились, лимит поднимается своим исключением', async () => {
    stubFetch([new Response('Limit exceeded.', { status: 429 })]);
    const client = createClient();

    await expect(client.post('/v1/parks/orders/list', {}, 'заказы')).rejects.toBeInstanceOf(
      FleetRateLimitError,
    );
    expect(client.stats().rateLimited).toBe(5);
  });

  it('пятисотка на той стороне повторяется', async () => {
    stubFetch([new Response('', { status: 500 }), jsonResponse({ orders: [] })]);
    const client = createClient();

    await client.post('/v1/parks/orders/list', {}, 'заказы');

    expect(client.stats().requests).toBe(2);
  });

  it('неверный ключ не повторяется вовсе', async () => {
    stubFetch([new Response(JSON.stringify({ code: '403' }), { status: 403 })]);
    const client = createClient();

    await expect(client.post('/v1/parks/orders/list', {}, 'заказы')).rejects.toBeInstanceOf(
      FleetApiError,
    );
    // Повторять нечего: права от повтора не появятся.
    expect(client.stats().requests).toBe(1);
  });
});
