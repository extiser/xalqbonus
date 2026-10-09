import type { WebLanguage } from './denials';
import { monthYear } from './monthNames';

/**
 * Расходы на найм — окно «Расходы на найм» плитки «Окупается ли найм» (issue #445): отказы
 * записи — код, поле формы и текст к нему.
 *
 * Словарь отдельный от `shared/denials.ts`, как `shared/promo.ts`: там — отказы двери, здесь —
 * предмет разговора (docs/decisions.md → «Граница словаря — дверь»). Сервер кладёт текст
 * в ответ отказавшей ручки с полем из `HIRE_COST_DENIAL_FIELDS`: отказ суммы окно ставит под поле,
 * отказ месяца — плашкой, поля месяца в окне нет.
 *
 * Относительными путями, а не через `#shared`: так подключаются соседние файлы `shared/`.
 */

/** Отказ записи расходов — по полю формы. */
export type HireCostDenialCode = 'hire_cost_amount_invalid' | 'hire_cost_month_invalid';

/** Поле формы расходов, к которому относится отказ. */
export type HireCostField = 'amount' | 'month';

export const HIRE_COST_DENIAL_FIELDS: Readonly<Record<HireCostDenialCode, HireCostField>> = {
  hire_cost_amount_invalid: 'amount',
  hire_cost_month_invalid: 'month',
};

/** Месяцы, за которые можно записать расходы: от первого месяца дашборда по идущий (`metricsMonthRange`). */
export type HireCostMonthRange = { firstMonth: string; lastMonth: string };

const HIRE_COST_DENIAL_TEXTS: Readonly<
  Record<HireCostDenialCode, Readonly<Record<WebLanguage, (range: HireCostMonthRange) => string>>>
> = {
  hire_cost_amount_invalid: { ru: () => 'Впишите сумму больше нуля' },
  hire_cost_month_invalid: {
    ru: ({ firstMonth, lastMonth }) =>
      `Месяц — с ${monthYear(firstMonth, 'genitive')} по ${monthYear(lastMonth, 'nominative')}`,
  },
};

export const hireCostDenialText = (
  code: HireCostDenialCode,
  language: WebLanguage,
  range: HireCostMonthRange,
): string => HIRE_COST_DENIAL_TEXTS[code][language](range);

/**
 * Стоимость найма одного — расходы месяца ÷ нанятых в нём, сум; и окупаемость — доход с нанятого
 * ÷ эта стоимость, до десятой. Общие у плитки (считает сервер) и у расчёта в окне (считает
 * клиент по вписанной сумме): одно число на экране не должно расходиться с окном.
 * Нанятых нет — ни стоимости, ни окупаемости.
 */
export const hireCostPerHired = (amount: number, hired: number): number | null =>
  hired > 0 ? Math.round(amount / hired) : null;

export const hirePaybackOf = (valuePerHired: number, amount: number, hired: number): number | null =>
  hired > 0 && amount > 0 ? Math.round(((valuePerHired * hired) / amount) * 10) / 10 : null;
