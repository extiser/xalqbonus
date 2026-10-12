import { setLandingArchivedAt } from '#server/repositories/landings';
import { LandingFailure } from '#server/services/promo/landingFailure';
import type { LandingArchived } from '#shared/types/landings';

/**
 * «В архив» и «Вернуть из архива» (issue #478). Лендинг в архиве у новых меток не выбирается,
 * у меток, где он уже стоит, работает как раньше: метки читают лендинг, а не его архив.
 */
export const setLandingArchived = async (landingId: string, archived: boolean): Promise<LandingArchived> => {
  const updated = await setLandingArchivedAt(landingId, archived ? new Date() : null);

  if (!updated) {
    throw new LandingFailure('landing_not_found');
  }

  return { archived };
};
