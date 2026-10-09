import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readHirePayback } from '#server/services/metrics/readHirePayback';
import { HireCostInputError, saveHireCost } from '#server/services/metrics/saveHireCost';
import {
  cleanupTestData,
  createTestPerson,
  disconnectDatabase,
  reassignProfileToPerson,
  type TestPerson,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import {
  cleanupTestHireCosts,
  cleanupTestMoney,
  insertTestMoneyRun,
  insertTestPersonMonths,
  markTestPersonDemo,
  readTestHireCosts,
  setTestHireDate,
  type TestPersonMonth,
} from '../support/metrics';

/**
 * «Окупается ли найм» против настоящей базы (issue #445).
 *
 * Нанятых и доход с нанятого считают сырые запросы по реестру и `metric_person_months`: правка
 * любого из них ломает цифры молча, типы этого не ловят (docs/infra.md → «Тесты», третье
 * исключение). Плитка — сервисом ручки «Глубины», запись — сервисом ручки окна.
 *
 * «Сейчас» — 15 декабря 2029: декабрь идёт, вчера — 14-е. Плитка ноября 2029 — месяц цены он же,
 * наборы найма — декабрь 2027 … ноябрь 2028, ставка ноября — 5 %; плитка декабря — месяц цены ноябрь.
 *
 * Наборы:
 * - `cohortTwoProfiles` нанят 5 и 20 марта 2028 двумя профилями — один нанятый; в апреле 2028
 *   оплата 1 000 — доход 50
 * - `cohortNotRode` нанят в июне 2028 и не ездил — в среднее идёт нулём
 * - `cohortDemo` нанят в июне 2028 — не входит
 * - `cohortLate` нанят в мае 2028: апрель 2029 (`m + 11`) — 2 000, доход 100; май 2029 (`m + 12`) — вне года
 *
 * Нанятые месяцев плитки:
 * - ноябрь 2029: человек с двумя профилями (2 и 20 ноября), ещё один 30 ноября и демо — нанятых двое
 * - декабрь 2029, идущий: 14-го — вчера, считается; 15-го — сегодня, ещё нет
 */

const NOW = new Date('2029-12-15T12:00:00Z');

describe('окупаемость найма', () => {
  let rateHolder: TestPerson;
  let firstEmployee: string;
  let secondEmployee: string;

  const row = (month: string, person: TestPerson, payment: string, fee = '0'): TestPersonMonth => ({
    month,
    personId: person.personId,
    orders: 1,
    fee,
    payment,
    feeNewcomerRate: '0',
    paymentNewcomerRate: '0',
    feeNewcomerRateLatest: '0',
    paymentNewcomerRateLatest: '0',
    paymentHireDays14: '0',
    paymentHireDays28: '0',
  });

  /** Человек с датой найма; `extraHireDay` — второй профиль того же человека. */
  const hiredPerson = async (hireDay: string, extraHireDay?: string): Promise<TestPerson> => {
    const person = await createTestPerson({ inProgram: false });

    await setTestHireDate(person.profileId, hireDay);

    if (extraHireDay !== undefined) {
      const donor = await createTestPerson({ inProgram: false });

      await setTestHireDate(donor.profileId, extraHireDay);
      await reassignProfileToPerson(donor.profileId, person.personId);
    }

    return person;
  };

  beforeAll(async () => {
    await cleanupTestMoney([]);
    await cleanupTestHireCosts();

    const cohortTwoProfiles = await hiredPerson('2028-03-05', '2028-03-20');
    await hiredPerson('2028-06-10');
    const cohortDemo = await hiredPerson('2028-06-10');
    const cohortLate = await hiredPerson('2028-05-01');

    rateHolder = await hiredPerson('2029-11-02', '2029-11-20');
    await hiredPerson('2029-11-30');
    const monthDemo = await hiredPerson('2029-11-10');

    await hiredPerson('2029-12-14');
    await hiredPerson('2029-12-15');

    await markTestPersonDemo(cohortDemo.personId);
    await markTestPersonDemo(monthDemo.personId);

    await insertTestPersonMonths([
      row('2028-04-01', cohortTwoProfiles, '1000'),
      row('2028-06-01', cohortDemo, '5000'),
      row('2029-04-01', cohortLate, '2000'),
      row('2029-05-01', cohortLate, '9000'),
      // Ставка ноября 2029: 50 ÷ 1 000 = 5 %, оплаты новичков нет — ставка новичка та же.
      row('2029-11-01', rateHolder, '1000', '50'),
    ]);
    await insertTestMoneyRun('2029-12-14', new Date('2029-12-15T01:00:00Z'));

    firstEmployee = (await createTestEmployee({ role: 'owner' })).employeeId;
    secondEmployee = (await createTestEmployee({ role: 'admin' })).employeeId;
  });

  afterAll(async () => {
    await cleanupTestHireCosts();
    await cleanupTestEmployees();
    await cleanupTestMoney([]);
    await cleanupTestData();
    await disconnectDatabase();
  });

  it('нанятые месяца — человек один раз при двух профилях, демо не входит', async () => {
    const payback = await readHirePayback('2029-11', NOW);

    expect(payback).toMatchObject({
      month: '2029-11',
      ongoing: false,
      monthHired: 2,
      monthHiredTo: '2029-11-30',
    });
  });

  it('идущий месяц — нанятые по вчера, нанятый сегодня не считается; доход — по прошлому месяцу', async () => {
    const payback = await readHirePayback('2029-12', NOW);

    expect(payback).toMatchObject({
      month: '2029-12',
      ongoing: true,
      valueMonth: '2029-11',
      monthHired: 1,
      monthHiredTo: '2029-12-14',
      valuePerHired: 50,
    });
  });

  it('доход с нанятого — среднее с нулями непоехавших, за 12 месяцев с месяца найма', async () => {
    const payback = await readHirePayback('2029-11', NOW);

    // (50 + 0 + 100) ÷ 3: май 2029 у нанятого в мае 2028 — уже вне года.
    expect(payback).toMatchObject({
      valueMonth: '2029-11',
      cohortsFrom: '2027-12',
      cohortsTo: '2028-11',
      valuePerHired: 50,
      hired: 3,
      notRode: 1,
      notRodePercent: 33,
      cost: null,
      payback: null,
    });
  });

  it('запись другого месяца на месяц плитки не действует', async () => {
    await saveHireCost({ month: '2029-10', amount: 1_000, employeeId: firstEmployee }, NOW);

    const november = await readHirePayback('2029-11', NOW);

    expect(november.cost).toBeNull();
    expect(november.payback).toBeNull();

    await saveHireCost({ month: '2029-11', amount: 300, employeeId: firstEmployee }, NOW);

    // 300 ÷ 2 нанятых = 150; 50 ÷ 150 = 0,33.
    const withCost = await readHirePayback('2029-11', NOW);

    expect(withCost.cost).toEqual({ amount: 300, perHired: 150 });
    expect(withCost.payback).toBe(0.3);
  });

  it('запись того же месяца заменяется', async () => {
    const saved = await saveHireCost({ month: '2029-11', amount: 600, employeeId: secondEmployee }, NOW);

    expect(saved).toMatchObject({ month: '2029-11', amount: 600, updatedBy: secondEmployee });
    expect(await readTestHireCosts()).toEqual([
      { month: '2029-10', amount: '1000', updatedBy: firstEmployee },
      { month: '2029-11', amount: '600', updatedBy: secondEmployee },
    ]);
  });

  it('бюджет на идущий месяц принимается и делится на нанятых по вчера', async () => {
    await saveHireCost({ month: '2029-12', amount: 25, employeeId: firstEmployee }, NOW);

    // 25 ÷ 1 нанятого = 25; 50 ÷ 25 = 2.
    const december = await readHirePayback('2029-12', NOW);

    expect(december.cost).toEqual({ amount: 25, perHired: 25 });
    expect(december.payback).toBe(2);
  });

  it('месяц позже идущего и сумма не больше нуля — отказ по обоим полям', async () => {
    const refusal = await saveHireCost({ month: '2030-01', amount: 0, employeeId: firstEmployee }, NOW).catch(
      (error: unknown) => error,
    );

    expect(refusal).toBeInstanceOf(HireCostInputError);
    expect((refusal as HireCostInputError).problems).toEqual(['hire_cost_amount_invalid', 'hire_cost_month_invalid']);
    expect((refusal as HireCostInputError).range).toEqual({ firstMonth: '2025-10', lastMonth: '2029-12' });
  });
});
