import { insertLandingVersion } from '#server/repositories/landings';
import { inspectLandingArchive } from '#server/services/promo/inspectLandingArchive';
import { LandingFailure } from '#server/services/promo/landingFailure';
import { rollbackVersion, writeVersionFilesOrRollback } from '#server/services/promo/saveLandingVersion';
import type { LandingVersionAdded } from '#shared/types/landings';

/**
 * Замена лендинга (issue #478): новая версия с номером на 1 больше, тем же порядком записи,
 * что у загрузки. Название не меняется. Лендинг в архиве заменить можно.
 *
 * Не прошедшая проверку замена действующую версию не сменяет: метки показывают прежнюю, пока
 * очередная замена не пройдёт (docs/decisions.md → «Лендинги в „Промо“»).
 */
export type AddLandingVersionRequest = {
  landingId: string;
  archive: Uint8Array | null;
  employeeId: string;
};

export const addLandingVersion = async (request: AddLandingVersionRequest): Promise<LandingVersionAdded> => {
  if (request.archive === null) {
    throw new LandingFailure('landing_archive_invalid');
  }

  const inspection = inspectLandingArchive(request.archive);
  const version = await insertLandingVersion(request.landingId, {
    html: inspection.html,
    passed: inspection.passed,
    checks: inspection.checks,
    uploadedByEmployeeId: request.employeeId,
  });

  if (version === null) {
    throw new LandingFailure('landing_not_found');
  }

  await writeVersionFilesOrRollback(version.versionId, inspection, rollbackVersion(version.versionId));

  return { number: version.number, passed: inspection.passed };
};
