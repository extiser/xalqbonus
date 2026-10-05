/**
 * Разовый пересчёт таблицы метрик дашборда, мимо очереди (issues #371, #387).
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
import { recomputePersonDays } from '#server/services/metrics/recomputePersonDays';

const log = consola.withTag('metrics-recompute');

const main = async (): Promise<void> => {
  const summary = await recomputePersonDays();

  log.info('Сводка пересчёта', {
    daysFrom: summary.daysFrom,
    daysTo: summary.daysTo,
    rows: summary.rows,
    unattributedOrders: summary.unattributedOrders,
    durationSec: Math.round(summary.durationMs / 100) / 10,
  });
};

main()
  .catch((error: unknown) => {
    log.error('Пересчёт упал', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
