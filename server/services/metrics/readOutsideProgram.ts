import { readOutsideProgramTotals } from '#server/repositories/metrics';
import type { DashboardOutsideProgram } from '#shared/types/dashboard';

/**
 * Плитка «Вне программы» за сутки `from`–`to` включительно (issue #373): люди на линии из готовой
 * таблицы `metric_person_days`, у которых нет ни одной привязки Telegram раньше конца периода,
 * их поездки и все поездки периода.
 *
 * Участник — хоть раз привязал Telegram, живость привязки не важна (docs/decisions.md →
 * «Баллы в метриках дашборда»). Привязавший позже конца периода за этот период — вне программы.
 */
export const readOutsideProgram = (period: { from: string; to: string }): Promise<DashboardOutsideProgram> =>
  readOutsideProgramTotals(period.from, period.to);
