import { listLandingLabels, listLandingRecords } from '#server/repositories/landings';
import { applicationScreenTexts } from '#server/services/candidates/applicationScreen';
import { toLandingRow } from '#server/services/promo/landingView';
import type { LandingList } from '#shared/types/landings';

/**
 * Вкладка «Лендинги» (issue #478): загруженные лендинги и экран заявки по умолчанию.
 *
 * Экран по умолчанию в базе не лежит — он встроен в приложение, — но стоит у меток рекламы
 * со входом «Приложение» без лендинга, и предпросмотр рисует его русскими текстами из того же
 * словаря, что Mini App.
 */
export const listLandings = async (): Promise<LandingList> => {
  const [records, defaultLabels] = await Promise.all([listLandingRecords(), listLandingLabels(null)]);

  return {
    landings: records.map(toLandingRow),
    defaultScreen: {
      labelCount: defaultLabels.length,
      labels: defaultLabels,
      texts: applicationScreenTexts().ru,
    },
  };
};
