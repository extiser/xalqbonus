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
 * Нанятых и доход с нанятого считают сырые запросы по реестру и `metric_person_months`, действующую
 * запись расходов — запрос «наибольший месяц не позже»: правка любого из них ломает цифры молча,
 * типы этого не ловят (docs/infra.md → «Тесты», третье исключение). Плитка — сервисом ручки
 * «Глубины», запись — сервисом ручки окна.
 *
 * Плитка за ноябрь 2029: наборы найма — декабрь 2027 … ноябрь 2028, ставки ноября 2029 — 5 %.
 *
 * - `twoProfiles` нанят 5 и 20 марта 2028 двумя профилями — один нанятый; в апреле 2028 оплата
 *   1 000 — доход 50
 * - `notRode` нанят в июне 2028 и не ездил — в среднее идёт нулём
 * - `demo` нанят в июне 2028 — не входит ни в наборы, ни в нанятых месяца
 * - `late` нанят в мае 2028: апрель 2029 (`m + 11`) — 2 000, доход 100; май 2029 (`m + 12`) — вне года
 * - `hiredInMonth` и `hiredInMonthToo` наняты в ноябре 2029 — нанятые месяца плитки
 */

const NOW = new Date('2029-12-15T12:00:00Z');

describe('окупаемость найма', () => {
  let twoProfiles: TestPerson;
  let notRode: TestPerson;
  let late: TestPerson;
  let hiredInMonth: TestPerson;
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
  });

  beforeAll(async () => {
    await cleanupTestMoney([]);
    await cleanupTestHireCosts();

    twoProfiles = await createTestPerson({ inProgram: false });
    const secondProfile = await createTestPerson({ inProgram: false });
    notRode = await createTestPerson({ inProgram: false });
    const demo = await createTestPerson({ inProgram: false });
    late = await createTestPerson({ inProgram: false });
    hiredInMonth = await createTestPerson({ inProgram: false });
    const hiredInMonthToo = await createTestPerson({ inProgram: false });

    await setTestHireDate(twoProfiles.profileId, '2028-03-05');
    await setTestHireDate(secondProfile.profileId, '2028-03-20');
    await reassignProfileToPerson(secondProfile.profileId, twoProfiles.personId);
    await setTestHireDate(notRode.profileId, '2028-06-10');
    await setTestHireDate(demo.profileId, '2028-06-10');
    await markTestPersonDemo(demo.personId);
    await setTestHireDate(late.profileId, '2028-05-01');
    await setTestHireDate(hiredInMonth.profileId, '2029-11-02');
    await setTestHireDate(hiredInMonthToo.profileId, '2029-11-30');

    await insertTestPersonMonths([
      row('2028-04-01', twoProfiles, '1000'),
      row('2028-06-01', demo, '5000'),
      row('2029-04-01', late, '2000'),
      row('2029-05-01', late, '9000'),
      // Ставка ноября 2029: 50 ÷ 1 000 = 5 %, оплаты новичков нет — ставка новичка та же.
      row('2029-11-01', hiredInMonth, '1000', '50'),
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
    const hired = (month: string): number | undefined => payback.hiredByMonth.find((item) => item.month === month)?.hired;

    expect(payback.hiredByMonth[0]).toEqual({ month: '2025-10', hired: 0 });
    expect(payback.hiredByMonth.at(-1)).toEqual({ month: '2029-11', hired: 2 });
    expect(hired('2028-03')).toBe(1);
    expect(hired('2028-06')).toBe(1);
    expect(hired('2028-05')).toBe(1);
  });

  it('доход с нанятого — среднее с нулями непоехавших, за 12 месяцев с месяца найма', async () => {
    const payback = await readHirePayback('2029-11', NOW);

    // (50 + 0 + 100) ÷ 3: май 2029 у нанятого в мае 2028 — уже вне года.
    expect(payback).toMatchObject({
      month: '2029-11',
      ongoing: false,
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

  it('действует запись не позже месяца плитки, с наибольшим месяцем', async () => {
    // Запись декабря 2029 — для плитки января 2030, где декабрь уже закрыт.
    await saveHireCost({ month: '2029-12', amount: 5_000, employeeId: firstEmployee }, new Date('2030-01-15T12:00:00Z'));
    await saveHireCost({ month: '2029-10', amount: 1_000, employeeId: firstEmployee }, NOW);

    const before = await readHirePayback('2029-11', NOW);

    // 1 000 ÷ 2 нанятых = 500; 50 ÷ 500 = 0,1.
    expect(before.cost).toEqual({ amount: 1_000, fromMonth: '2029-10', perHired: 500 });
    expect(before.payback).toBe(0.1);

    await saveHireCost({ month: '2029-11', amount: 300, employeeId: firstEmployee }, NOW);

    const equal = await readHirePayback('2029-11', NOW);

    // 300 ÷ 2 = 150; 50 ÷ 150 = 0,33.
    expect(equal.cost).toEqual({ amount: 300, fromMonth: '2029-11', perHired: 150 });
    expect(equal.payback).toBe(0.3);
  });

  it('запись того же месяца заменяется', async () => {
    const saved = await saveHireCost({ month: '2029-11', amount: 600, employeeId: secondEmployee }, NOW);

    expect(saved).toMatchObject({ month: '2029-11', amount: 600, updatedBy: secondEmployee });
    expect(await readTestHireCosts()).toEqual([
      { month: '2029-10', amount: '1000', updatedBy: firstEmployee },
      { month: '2029-11', amount: '600', updatedBy: secondEmployee },
      { month: '2029-12', amount: '5000', updatedBy: firstEmployee },
    ]);
  });

  it('сумма не больше нуля и месяц позже последнего закрытого — отказ по обоим полям', async () => {
    const refusal = await saveHireCost({ month: '2029-12', amount: 0, employeeId: firstEmployee }, NOW).catch(
      (error: unknown) => error,
    );

    expect(refusal).toBeInstanceOf(HireCostInputError);
    expect((refusal as HireCostInputError).problems).toEqual(['hire_cost_amount_invalid', 'hire_cost_month_invalid']);
    expect((refusal as HireCostInputError).range).toEqual({ firstMonth: '2025-10', lastMonth: '2029-11' });
  });
});
