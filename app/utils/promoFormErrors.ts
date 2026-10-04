import { failureDetails, failureField, failureMessage } from '~/utils/requestError';
import { isPromoField, type PromoField } from '#shared/promo';

/**
 * Ошибки формы метки по полям из отказа ручки (issue #380). Ручка называет все негодные поля
 * сразу (`fields`), а если их нет — одно, как любой отказ по полю. `null` — отказ не про поля:
 * сеть, сервер; его форма показывает плашкой над полями.
 *
 * Тексты — те, что прислал сервер: они из словаря `shared/promo.ts`, своих у формы нет.
 */
export const readPromoFieldErrors = (error: unknown): Partial<Record<PromoField, string>> | null => {
  const errors: Partial<Record<PromoField, string>> = {};
  const fields = failureDetails(error)?.fields;

  if (typeof fields === 'object' && fields !== null) {
    for (const [field, text] of Object.entries(fields)) {
      if (isPromoField(field) && typeof text === 'string') errors[field] = text;
    }
  }

  const field = failureField(error);
  const message = failureMessage(error);

  if (isPromoField(field) && message !== null) errors[field] ??= message;

  return Object.keys(errors).length > 0 ? errors : null;
};
