import { describe, expect, it } from 'vitest';

import { parseOrdersPage } from '#server/adapters/fleet/orders';

/**
 * Разбор ответа Fleet API.
 *
 * Проверяется главное свойство: **чужой словарь нас не роняет**. Новая категория тарифа
 * или новый способ оплаты на той стороне обязаны записаться текстом и попасть в счётчик,
 * а не отбить вставку в разгар прогона (docs/decisions.md → «Перечисления заводим только
 * на свои словари»).
 *
 * Образец собран по живому ответу из `_reference/fleet-api/samples/`, но лежит в тесте
 * целиком: выгрузки в репозиторий не коммитятся, а тест обязан работать на чистой копии.
 */

const completedOrder = {
  id: '04664a21e948c9d8ab0e49d8c8b1dbcb',
  short_id: 26_254_091,
  status: 'complete',
  created_at: '2026-08-27T10:16:38.04+00:00',
  booked_at: '2026-08-27T10:21:46.57+00:00',
  provider: 'platform',
  category: 'comfort',
  amenities: ['creditcard'],
  address_from: {
    address: 'Мирабадский район, улица Авлиё-Ата, 128',
    lat: 41.288_576_559_328_76,
    lon: 69.281_676_718_002_77,
  },
  route_points: [
    { address: 'улица Чаштепа', lat: 41.252_957_826_968_57, lon: 69.215_747_679_731_1 },
    { address: 'улица Бабура', lat: 41.3, lon: 69.2 },
  ],
  events: [
    { event_at: '2026-08-27T10:16:43.649+00:00', order_status: 'driving' },
    { event_at: '2026-08-27T10:23:24.832+00:00', order_status: 'waiting' },
    { event_at: '2026-08-27T10:35:49.192+00:00', order_status: 'complete' },
  ],
  ended_at: '2026-08-27T10:35:49.192+00:00',
  payment_method: 'cashless',
  driver_profile: { id: '2f88cc3f714842e287ec184c1bdc02bd', name: 'Иванов Пётр Николаевич' },
  car: {
    id: 'df9d25cfd73946e796423d439e17b8ac',
    brand_model: 'BYD E2',
    license: { number: '01***VС' },
    callsign: '19924',
  },
  type: { id: '4964b852670045b196e526d59915b777', name: 'Яндекс.Безналичный' },
  price: '31500.0000',
  mileage: '7790.0000',
  driving_at: '2026-08-27T10:16:43.649+00:00',
  flags: ['show_address'],
};

describe('разбор страницы заказов', () => {
  it('раскладывает заказ по полям', () => {
    const page = parseOrdersPage({ orders: [completedOrder], limit: 500, cursor: 'next-page' });

    expect(page.received).toBe(1);
    expect(page.malformed).toBe(0);
    expect(page.cursor).toBe('next-page');

    const order = page.orders[0];

    expect(order?.orderId).toBe('04664a21e948c9d8ab0e49d8c8b1dbcb');
    expect(order?.profileId).toBe('2f88cc3f714842e287ec184c1bdc02bd');
    expect(order?.status).toBe('complete');
    expect(order?.endedAt?.toISOString()).toBe('2026-08-27T10:35:49.192Z');
    // Стоимость остаётся строкой: разбор во float теряет копейки на миллионе строк.
    expect(order?.price).toBe('31500.0000');
    expect(order?.carLicenseNumber).toBe('01***VС');
    expect(order?.orderTypeName).toBe('Яндекс.Безналичный');
    expect(order?.flags).toEqual(['show_address']);
    expect(order?.events).toHaveLength(3);
    expect(order?.routePoints.map((point) => point.seq)).toEqual([1, 2]);
  });

  it('не роняет разбор на незнакомом значении чужого словаря', () => {
    const page = parseOrdersPage({
      orders: [{ ...completedOrder, category: 'submarine', payment_method: 'crypto' }],
      cursor: '',
    });

    expect(page.malformed).toBe(0);
    // Значение записывается как есть — колонка текстовая, и новая категория на той стороне
    // не должна отбивать вставку.
    expect(page.orders[0]?.category).toBe('submarine');
    expect(page.orders[0]?.paymentMethod).toBe('crypto');
    expect(page.unknownValues).toEqual(
      expect.arrayContaining(['category=submarine', 'payment_method=crypto']),
    );
  });

  it('пропускает заказ без обязательного поля, не теряя соседей', () => {
    const withoutDriver = { ...completedOrder, id: 'no-driver', driver_profile: {} };

    const page = parseOrdersPage({ orders: [withoutDriver, completedOrder] });

    expect(page.received).toBe(2);
    expect(page.malformed).toBe(1);
    expect(page.orders).toHaveLength(1);
    expect(page.orders[0]?.orderId).toBe('04664a21e948c9d8ab0e49d8c8b1dbcb');
    // Пропущенный заказ обязан назвать себя: прогон успешен, отметка встанет на верхнюю
    // границу окна, и достать его потом можно будет только по идентификатору.
    expect(page.malformedIds).toEqual([{ orderId: 'no-driver', field: 'driver_profile.id' }]);
  });

  it('заказ без идентификатора вовсе тоже попадает в список пропущенного', () => {
    const { id: _unused, ...withoutId } = completedOrder;

    const page = parseOrdersPage({ orders: [withoutId, {}, 'не объект'] });

    expect(page.malformed).toBe(3);
    expect(page.malformedIds).toEqual([
      { orderId: '(без id)', field: 'id' },
      { orderId: '(без id)', field: 'id' },
      { orderId: '(без id)', field: '(запись не объект)' },
    ]);
  });

  it('пустой курсор читается как конец выборки', () => {
    const page = parseOrdersPage({ orders: [], limit: 500, cursor: '' });

    expect(page.received).toBe(0);
    expect(page.cursor).toBeNull();
  });
});
