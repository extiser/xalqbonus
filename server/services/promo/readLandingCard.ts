import { findLandingRecord, findLandingVersions, listLandingLabels } from '#server/repositories/landings';
import { lastVersionOf, liveVersionOf, toLandingRow, toLandingVersionView } from '#server/services/promo/landingView';
import type { LandingCard } from '#shared/types/landings';

/**
 * Предпросмотр лендинга (issue #478): строка списка, метки на нём, последняя версия с проверкой
 * и действующая — та, что видят люди. `null` — лендинга нет.
 *
 * Действующая совпадает с последней — отдаётся та же, а не `null`: `null` значит «ни одна версия
 * не прошла проверку».
 */
export const readLandingCard = async (landingId: string): Promise<LandingCard | null> => {
  const record = await findLandingRecord(landingId);

  if (record === null) {
    return null;
  }

  const last = lastVersionOf(record.versions);
  const live = liveVersionOf(record.versions);

  if (last === null) {
    throw new Error(`у лендинга ${record.id} нет версий`);
  }

  const [labels, versions] = await Promise.all([
    listLandingLabels(record.id),
    findLandingVersions(live === null ? [last.id] : [last.id, live.id]),
  ]);

  const lastVersion = versions.find((version) => version.id === last.id);
  const liveVersion = live === null ? null : versions.find((version) => version.id === live.id);

  if (lastVersion === undefined || liveVersion === undefined) {
    throw new Error(`версии лендинга ${record.id} не прочитались`);
  }

  return {
    ...toLandingRow(record),
    labels,
    lastVersion: toLandingVersionView(lastVersion),
    liveVersion: liveVersion === null ? null : toLandingVersionView(liveVersion),
  };
};
