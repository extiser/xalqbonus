import { describe, expect, it } from 'vitest';

import { decomposeProduct } from '#server/services/metrics/decomposeMultipliers';

/**
 * Разложение дохода «Денег» на множители (issue #438) — та же формула, что у поездок
 * «Рычагов»: вклады целые и складываются ровно в изменение дохода.
 *
 * Цифры — сентябрь 2026 к сентябрю 2025, прод (`product/metrics/park-income-by-month-2026-10.md`):
 * доход 122 231 177 против 180 433 479, заказов 79 748 против 99 430, оплата сентября 2026 —
 * 2 652 699 234. Оплата сентября 2025 в замере дана оплатой на заказ, 31 650 сум.
 */

const MONEY_FACTOR_KEYS = ['orders', 'paymentPerOrder', 'commission'] as const;

const values = (income: number, orders: number, payment: number) => ({
  income,
  orders,
  paymentPerOrder: payment / orders,
  commission: income / payment,
});

describe('разложение дохода', () => {
  it('сентябрь 2026 к сентябрю 2025: вклады складываются ровно в −58 202 302', () => {
    const current = values(122_231_177, 79_748, 2_652_699_234);
    const base = values(180_433_479, 99_430, 99_430 * 31_650);
    const contributions = decomposeProduct(current, base, 'income', MONEY_FACTOR_KEYS);

    expect(contributions?.total).toBe(-58_202_302);
    expect(
      (contributions?.orders ?? 0) + (contributions?.paymentPerOrder ?? 0) + (contributions?.commission ?? 0),
    ).toBe(-58_202_302);
    // Вклад заказов от оплаты не зависит: −32,97 млн независимого замера.
    expect(Math.round((contributions?.orders ?? 0) / 10_000) / 100).toBe(-32.97);
    expect(Number.isInteger(contributions?.paymentPerOrder)).toBe(true);
    expect(Number.isInteger(contributions?.commission)).toBe(true);
  });

  it('в базе или периоде дохода ноль — разложения нет', () => {
    const current = values(122_231_177, 79_748, 2_652_699_234);

    expect(decomposeProduct(current, { ...current, income: 0 }, 'income', MONEY_FACTOR_KEYS)).toBeNull();
    expect(decomposeProduct({ ...current, income: 0 }, current, 'income', MONEY_FACTOR_KEYS)).toBeNull();
  });
});
