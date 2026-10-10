import { updatePromoLinkFields } from '#server/repositories/promo';
import { readPromoName, readPromoPlacement, throwPromoProblems } from '#server/services/promo/promoFields';
import type { PromoDenialCode } from '../../../shared/promo';

/**
 * Правка метки — «Изменить» в карточке (issue #380): только название и место. Код уже
 * напечатан, носитель — часть смысла метки, вход — ссылка в объявлении (issue #467);
 * все трое не меняются.
 *
 * `false` — метки с таким кодом нет.
 */
export const updatePromoLink = async (
  code: string,
  input: { name: unknown; placement: unknown },
): Promise<boolean> => {
  const problems: PromoDenialCode[] = [];
  const name = readPromoName(input.name, problems);
  const placement = readPromoPlacement(input.placement, problems);

  throwPromoProblems(problems);

  return updatePromoLinkFields(code, { name, placement });
};
