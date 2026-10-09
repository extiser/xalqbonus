// `createError` берётся из `h3` явно, а не автоимпортом: в общем пространстве имён имя занято
// обёрткой Nuxt, у которой номер ответа необязателен (`denial.ts`).
import { createError } from 'h3';

import { HireCostInputError } from '#server/services/metrics/saveHireCost';
import { WEB_LANGUAGE } from '#shared/denials';
import { HIRE_COST_DENIAL_FIELDS, hireCostDenialText, type HireCostField } from '#shared/hireCost';

/**
 * Отказ записи расходов на найм в ответе HTTP (issue #445), как у «Промо» (`promoFailure.ts`):
 * код — форме для решения, поле — куда встанет текст, текст — из словаря `shared/hireCost.ts`.
 * Негодных полей бывает два сразу: код, поле и текст — первого, `fields` — текст каждому.
 * Чужая ошибка уходит дальше как есть.
 */
export const rejectHireCostFailure = (error: unknown): unknown => {
  if (!(error instanceof HireCostInputError)) return error;

  const [code] = error.problems;
  const fields: Partial<Record<HireCostField, string>> = {};

  for (const problem of error.problems) {
    fields[HIRE_COST_DENIAL_FIELDS[problem]] ??= hireCostDenialText(problem, WEB_LANGUAGE, error.range);
  }

  return createError({
    statusCode: 400,
    statusMessage: 'Bad Request',
    message: hireCostDenialText(code, WEB_LANGUAGE, error.range),
    data: { code, field: HIRE_COST_DENIAL_FIELDS[code], fields },
  });
};
