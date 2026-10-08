import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readLastMetricMoneyRun } from '#server/repositories/metrics';
import { MONEY_FIRST_DAY } from '#server/services/metrics/constants';
import { withMoneyCoverage } from '#server/services/metrics/moneyCoverage';
import { readDashboardMoney } from '#server/services/metrics/readDashboardMoney';
import { recomputeMoneyDays } from '#server/services/metrics/recomputeMoneyDays';
import { disconnectDatabase } from '../support/database';
import {
  cleanupTestMoney,
  insertTestMoneyTransaction,
  readTestMoneyDays,
  upsertTestTransactionDay,
} from '../support/metrics';

/**
 * Пересчёт таблицы денег, вкладка «Деньги» и покрытие суток против настоящей базы (issue #438).
 *
 * Таблицу считает один сырой запрос над транзакциями, вкладку читают запросы итогов, покрытие —
 * журнал прогона истории транзакций. Миграция любой из таблиц сломает их молча: типы расхождения
 * со схемой не ловят (docs/infra.md → «Тесты», третье исключение). Тест гоняет их через сервисы,
 * которыми их зовут очередь, разовый пересчёт и ручка.
 *
 * Собранный месяц — октябрь 2025, базы — октябрь 2024 и сентябрь 2025: внутри окна денег
 * и вдали от транзакций остальных тестов. Покрытие — на сентябре и октябре 2026, у границы
 * `TRANSACTIONS_COMPLETE_FROM`.
 */

/** «Сейчас» пересчёта: окно денег — по 2025-11-04 включительно, октябрь 2025 закрыт. */
const NOW = new Date('2025-11-05T12:00:00Z');

const LAST_DAY = '2025-11-04';

/** Порции сбора истории транзакций под покрытие. */
const TRANSACTION_DAYS = ['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-10-04', '2026-10-05', '2026-10-06'];

const DAY_MS = 86_400_000;

const daysInclusive = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

beforeAll(async () => {
  // До первых суток денег — в таблицу не попадает.
  await insertTestMoneyTransaction('partner_ride_fee', new Date('2024-03-31T12:00:00Z'), '-999');

  // Сутки по Ташкенту на стыке UTC: 19:30Z 9-го — 00:30 10-го, 18:59:59Z 10-го — 23:59:59 10-го,
  // 19:00Z 10-го — уже 11-е. Комиссия в транзакции отрицательная, доход — с обратным знаком.
  await insertTestMoneyTransaction('partner_ride_fee', new Date('2025-10-09T19:30:00Z'), '-1500');
  await insertTestMoneyTransaction('partner_ride_fee', new Date('2025-10-10T18:59:59Z'), '-500');
  await insertTestMoneyTransaction('partner_ride_fee', new Date('2025-10-10T19:00:00Z'), '-700');

  // Оплата — шесть категорий как есть; чаевые, комиссия Яндекса и вывод денег — нет.
  const paidAt = new Date('2025-10-10T08:00:00Z');
  await insertTestMoneyTransaction('cash_collected', paidAt, '20000');
  await insertTestMoneyTransaction('card', paidAt, '15000.5');
  await insertTestMoneyTransaction('corporate', paidAt, '1000');
  await insertTestMoneyTransaction('promotion_promocode', paidAt, '500');
  await insertTestMoneyTransaction('promotion_discount', paidAt, '300');
  await insertTestMoneyTransaction('compensation', paidAt, '199.5');
  await insertTestMoneyTransaction('tips', paidAt, '5000');
  await insertTestMoneyTransaction('platform_ride_fee', paidAt, '-900');
  await insertTestMoneyTransaction('partner_service_manual_1', paidAt, '-100000');
  await insertTestMoneyTransaction('card', new Date('2025-10-10T19:00:00Z'), '30000');

  // Базы: тот же месяц год назад и прошлый месяц.
  await insertTestMoneyTransaction('partner_ride_fee', new Date('2024-10-15T08:00:00Z'), '-1000');
  await insertTestMoneyTransaction('partner_ride_fee', new Date('2024-10-15T09:00:00Z'), '-1000');
  await insertTestMoneyTransaction('card', new Date('2024-10-15T08:00:00Z'), '40000');
  await insertTestMoneyTransaction('partner_ride_fee', new Date('2025-09-15T08:00:00Z'), '-3000');
  await insertTestMoneyTransaction('card', new Date('2025-09-15T08:00:00Z'), '60000');

  await upsertTestTransactionDay('2026-09-09', 'closed');
  await upsertTestTransactionDay('2026-09-10', 'closed');
  await upsertTestTransactionDay('2026-09-11', 'unfinished');
  await upsertTestTransactionDay('2026-09-12', 'closed');
  await upsertTestTransactionDay('2026-10-04', 'closed');
  await upsertTestTransactionDay('2026-10-05', 'closed');
  await upsertTestTransactionDay('2026-10-06', 'cursor');

  await recomputeMoneyDays(NOW);
});

afterAll(async () => {
  await cleanupTestMoney(TRANSACTION_DAYS);
  await disconnectDatabase();
});

describe('пересчёт таблицы денег', () => {
  it('строка на каждые сутки от первых суток денег по вчерашние, пустые — с нулями', async () => {
    const rows = await readTestMoneyDays('2024-01-01', '2026-12-31');

    expect(rows).toHaveLength(daysInclusive(MONEY_FIRST_DAY, LAST_DAY));
    expect(rows[0]?.day).toBe(MONEY_FIRST_DAY);
    expect(rows[rows.length - 1]?.day).toBe(LAST_DAY);
    expect(await readTestMoneyDays('2025-10-12', '2025-10-12')).toEqual([
      { day: '2025-10-12', orders: 0, income: '0.0000', payment: '0.0000' },
    ]);
  });

  it('сутки по Ташкенту, доход с обратным знаком, оплата — только шесть категорий', async () => {
    expect(await readTestMoneyDays('2025-10-09', '2025-10-11')).toEqual([
      { day: '2025-10-09', orders: 0, income: '0.0000', payment: '0.0000' },
      { day: '2025-10-10', orders: 2, income: '2000.0000', payment: '37000.0000' },
      { day: '2025-10-11', orders: 1, income: '700.0000', payment: '30000.0000' },
    ]);
  });

  it('прогон закрыт в журнале и даёт последние посчитанные сутки', async () => {
    const run = await readLastMetricMoneyRun();

    expect(run?.daysTo).toBe(LAST_DAY);
    expect(run?.finishedAt).toBeInstanceOf(Date);
  });

  it('вкладка «Деньги» за закрытый месяц: итоги, базы, вклады и месяцы', async () => {
    const money = await readDashboardMoney('2025-10', NOW);

    expect(money.period).toEqual({ from: '2025-10-01', to: '2025-10-31', days: 31, partial: false, coveredDays: 0 });
    expect({ income: money.income, orders: money.orders, payment: money.payment }).toEqual({
      income: 2700,
      orders: 3,
      payment: 67000,
    });
    expect(money.computedAt).not.toBeNull();

    const { year, month } = money.bases;

    expect(year.perDay).toBe(false);
    expect(year.basePeriod).toMatchObject({ from: '2024-10-01', to: '2024-10-31', days: 31 });
    expect(year.base).toMatchObject({ income: 2000, orders: 2, paymentPerOrder: 20000, commission: 0.05 });
    expect(year.contributions?.total).toBe(700);
    expect(
      (year.contributions?.orders ?? 0) + (year.contributions?.paymentPerOrder ?? 0) + (year.contributions?.commission ?? 0),
    ).toBe(700);
    // Сутки октября не собраны: вывода нет.
    expect(year.conclusion).toBeNull();

    expect(month.perDay).toBe(true);
    expect(month.basePeriod).toMatchObject({ from: '2025-09-01', to: '2025-09-30', days: 30 });
    expect(month.current.income).toBe(Math.round(2700 / 31));
    expect(month.base?.income).toBe(100);
    expect(month.contributions?.total).toBe(Math.round(2700 / 31) - 100);

    expect(money.byMonth.map((column) => column.month)).toEqual([
      '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-04',
      '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10',
    ]);
    expect(money.byMonth[0]).toMatchObject({ income: 2000, days: 31, partial: false });
    expect(money.byMonth[11]).toMatchObject({ income: 3000, days: 30 });
    expect(money.byMonth[12]).toMatchObject({ income: 2700, days: 31, coveredDays: 0 });
  });
});

describe('покрытие суток денег', () => {
  const period = (from: string, to: string) => ({ from, to, days: daysInclusive(from, to), partial: true });

  it('сутки полны, когда обе порции сбора закрыты: незакрытая порция гасит двое суток', async () => {
    const covered = await withMoneyCoverage(period('2026-09-10', '2026-09-12'), '2026-10-31');

    // 10-е — порции 9-го и 10-го закрыты; 11-е — 11-я не закрыта; 12-е — 11-я не закрыта.
    expect(covered.coveredDays).toBe(1);
  });

  it('порция с курсором не закрыта; с TRANSACTIONS_COMPLETE_FROM журнал не нужен', async () => {
    const covered = await withMoneyCoverage(period('2026-10-05', '2026-10-08'), '2026-10-08');

    // 5-е — закрыты 4-я и 5-я; 6-е — у 6-й курсор; 7-е и 8-е — живой сбор.
    expect(covered.coveredDays).toBe(3);
  });

  it('сутки позже последнего прогона денег не покрыты; прогона не было — не покрыто ничего', async () => {
    expect((await withMoneyCoverage(period('2026-10-05', '2026-10-08'), '2026-10-07')).coveredDays).toBe(2);
    expect((await withMoneyCoverage(period('2026-10-05', '2026-10-08'), null)).coveredDays).toBe(0);
  });
});
