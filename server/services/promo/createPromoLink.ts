import { insertPromoLink, isPromoCodeTaken } from '#server/repositories/promo';
import {
  PromoInputError,
  readPromoMedium,
  readPromoName,
  readPromoPlacement,
  throwPromoProblems,
} from '#server/services/promo/promoFields';
import type { PromoDenialCode } from '../../../shared/promo';
import { readPromoCode } from '../../../shared/promoLinks';

/**
 * Заведение промо-метки (issue #380). Код приходит из формы — его выдал `generatePromoCode`,
 * — и проверяется заново: свободный при выдаче, к нажатию «Создать» он мог стать чужим.
 *
 * Отказы — все сразу, в порядке полей формы: название, носитель, место, ссылка. Занятость кода
 * спрашивается у базы только у годной формы: при негодных полях метка всё равно не заведётся.
 */

export type CreatePromoLinkRequest = {
  code: unknown;
  name: unknown;
  medium: unknown;
  placement: unknown;
  employeeId: string;
};

export const createPromoLink = async (request: CreatePromoLinkRequest): Promise<{ code: string }> => {
  const problems: PromoDenialCode[] = [];
  const name = readPromoName(request.name, problems);
  const medium = readPromoMedium(request.medium, problems);
  const placement = readPromoPlacement(request.placement, problems);
  const code = typeof request.code === 'string' ? readPromoCode(request.code) : null;

  if (code === null) problems.push('code_invalid');

  throwPromoProblems(problems);

  if (code === null || medium === null) {
    throw new Error('годная форма метки без кода или носителя');
  }

  if (await isPromoCodeTaken(code)) {
    throw new PromoInputError(['code_taken']);
  }

  const inserted = await insertPromoLink({
    code,
    name,
    medium,
    placement,
    createdByEmployeeId: request.employeeId,
  });

  if (!inserted) {
    throw new PromoInputError(['code_taken']);
  }

  return { code };
};
