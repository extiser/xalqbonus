import { isLandingSelectable } from '#server/repositories/landings';
import { findPromoLink, hasPromoTouches, updatePromoLinkFields } from '#server/repositories/promo';
import {
  acceptsLanding,
  readPromoLandingId,
  readPromoName,
  readPromoPlacement,
  throwPromoProblems,
} from '#server/services/promo/promoFields';
import type { PromoDenialCode } from '../../../shared/promo';

/**
 * Правка метки — «Изменить» в карточке (issue #380): название, место и лендинг (issue #478). Код уже
 * напечатан, носитель — часть смысла метки, вход — ссылка в объявлении (issue #467);
 * все трое не меняются.
 *
 * Лендинг меняется до первого перехода по метке: после — `landing_locked`, нужна новая метка,
 * чтобы воронка не смешивала лендинги (docs/decisions.md → «Лендинги в „Промо“»). Прислан тот же
 * лендинг, что стоит, — это не смена: форма шлёт поле всегда, и после перехода тоже.
 *
 * `false` — метки с таким кодом нет.
 */
export const updatePromoLink = async (
  code: string,
  input: { name: unknown; placement: unknown; landingId?: unknown },
): Promise<boolean> => {
  const problems: PromoDenialCode[] = [];
  const name = readPromoName(input.name, problems);
  const landingId = readPromoLandingId(input.landingId, problems);
  const link = landingId === undefined ? null : await findPromoLink(code);

  if (landingId !== undefined && link === null) {
    return false;
  }

  const changesLanding = link !== null && landingId !== undefined && landingId !== (link.landing?.id ?? null);

  if (link !== null && changesLanding) {
    if (await hasPromoTouches(code)) {
      problems.push('landing_locked');
    } else if (
      landingId !== null &&
      (!acceptsLanding(link.medium, link.entry) || !(await isLandingSelectable(landingId)))
    ) {
      problems.push('landing_unavailable');
    }
  }

  const placement = readPromoPlacement(input.placement, problems);

  throwPromoProblems(problems);

  return updatePromoLinkFields(code, changesLanding ? { name, placement, landingId } : { name, placement });
};
