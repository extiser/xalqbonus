/**
 * Разовый пересчёт таблиц метрик дашборда, мимо очереди (issues #371, #387, #438, #442): поездки
 * `metric_person_days` и деньги — `metric_money_days` и `metric_person_months`, подряд, сводка — по каждой.
 *
 * Тонкая обвязка над сервисом: вызов и сводка. Тем же кодом ходит ночная задача воркера —
 * второй реализации пересчёта не существует (docs/principles.md → «Слои и зависимости»).
 *
 * На проде — чтобы дашборд показал цифры в тот же день, а не после ночи: после выката
 * с новыми данными и после окончания прогона истории. Едет на машину бандлом из образа
 * (`.output/metrics-recompute.mjs`), порядок — docker/DEPLOY-MANUAL.md → «Разовый пересчёт
 * метрик дашборда». Локально — на копии боевой базы (`make copy-up`): воркер там остановлен,
 * и таблицу на копии наполняет только эта цель.
 *
 * Запуск: make prod-metrics-recompute (прод), make metrics-recompute (локально и на копии)
 */
import { consola } from 'consola';

import { db } from '#server/db';
import { recomputeMoneyDays } from '#server/services/metrics/recomputeMoneyDays';
import { recomputePersonDays } from '#server/services/metrics/recomputePersonDays';

const log = consola.withTag('metrics-recompute');

const seconds = (durationMs: number): number => Math.round(durationMs / 100) / 10;

const main = async (): Promise<void> => {
  const trips = await recomputePersonDays();

  log.info('Сводка пересчёта', {
    daysFrom: trips.daysFrom,
    daysTo: trips.daysTo,
    rows: trips.rows,
    unattributedOrders: trips.unattributedOrders,
    durationSec: seconds(trips.durationMs),
  });

  // Деньги — после поездок, тем же запуском: упали поездки — до денег дело не доходит,
  // и терминал говорит об одной ошибке, а не о двух.
  const money = await recomputeMoneyDays();

  log.info('Сводка пересчёта денег', {
    daysFrom: money.daysFrom,
    daysTo: money.daysTo,
    rows: money.rows,
    personMonthRows: money.personMonthRows,
    durationSec: seconds(money.durationMs),
  });
};

main()
  .catch((error: unknown) => {
    log.error('Пересчёт упал', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
