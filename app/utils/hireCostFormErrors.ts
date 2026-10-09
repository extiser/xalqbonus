import { failureDetails, failureField, failureMessage } from '~/utils/requestError';
import { isHireCostField, type HireCostField } from '#shared/hireCost';

/**
 * Ошибки окна «Расходы на найм» по полям из отказа ручки (issue #445), как у формы метки
 * (`promoFormErrors.ts`). Ручка называет все негодные поля сразу (`fields`), а если их нет —
 * одно. `null` — отказ не про поля: сеть, сервер; его форма показывает плашкой над полями.
 *
 * Тексты — те, что прислал сервер: они из словаря `shared/hireCost.ts`, своих у формы нет.
 */
export const readHireCostFieldErrors = (error: unknown): Partial<Record<HireCostField, string>> | null => {
  const errors: Partial<Record<HireCostField, string>> = {};
  const fields = failureDetails(error)?.fields;

  if (typeof fields === 'object' && fields !== null) {
    for (const [field, text] of Object.entries(fields)) {
      if (isHireCostField(field) && typeof text === 'string') errors[field] = text;
    }
  }

  const field = failureField(error);
  const message = failureMessage(error);

  if (isHireCostField(field) && message !== null) errors[field] ??= message;

  return Object.keys(errors).length > 0 ? errors : null;
};
