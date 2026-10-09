import { failureDetails, failureField, failureMessage, failureText } from '~/utils/requestError';
import type { HireCostField } from '#shared/hireCost';

/**
 * Отказ ручки расходов на найм, разложенный по окну «Расходы на найм» (issue #445). Поле в окне
 * одно — сумма: её текст встаёт под поле. Месяц приходит из плитки, поля для него нет, и его
 * отказ, как и отказ не про поля — сеть, сервер, — идёт плашкой над полем.
 *
 * Тексты — те, что прислал сервер: они из словаря `shared/hireCost.ts`, своих у формы нет.
 */
export type HireCostFormErrors = {
  amount: string | null;
  form: string | null;
};

/** Текст отказа по полю: из `fields`, а если их нет — из самого отказа, когда он про это поле. */
const fieldText = (error: unknown, field: HireCostField): string | null => {
  const fields = failureDetails(error)?.fields;
  const entries = typeof fields === 'object' && fields !== null ? Object.entries(fields) : [];
  const text = entries.find(([key]) => key === field)?.[1];

  if (typeof text === 'string') return text;

  return failureField(error) === field ? failureMessage(error) : null;
};

export const readHireCostErrors = (error: unknown): HireCostFormErrors => {
  const amount = fieldText(error, 'amount');
  const month = fieldText(error, 'month');

  return { amount, form: amount === null && month === null ? failureText(error) : month };
};
