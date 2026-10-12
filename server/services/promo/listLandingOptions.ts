import { listSelectableLandings } from '#server/repositories/landings';
import type { LandingOption } from '#shared/types/landings';

/**
 * Лендинги для выбора у метки (issue #478): не в архиве и с действующей версией, по названию.
 * Экран заявки по умолчанию сюда не входит — его форма ставит первым сама.
 */
export const listLandingOptions = async (): Promise<LandingOption[]> => listSelectableLandings();
