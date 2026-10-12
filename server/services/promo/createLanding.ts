import { deleteLandingWithVersions, insertLandingWithFirstVersion } from '#server/repositories/landings';
import { inspectLandingArchive } from '#server/services/promo/inspectLandingArchive';
import { LandingFailure } from '#server/services/promo/landingFailure';
import { readLandingName, writeVersionFilesOrRollback } from '#server/services/promo/saveLandingVersion';
import type { LandingCreated } from '#shared/types/landings';

/**
 * Загрузка лендинга (issue #478): название и архив. Архив проверяется заново — проверка в окне
 * была до нажатия «Загрузить», и запрос приходит не только из окна. Лендинг и версия 1 — одной
 * транзакцией, затем картинки версии на том; не легли — строки снимаются.
 *
 * Не прошедший проверку лендинг сохраняется: выбрать его у метки нельзя, исправить — заменой.
 */
export type CreateLandingRequest = {
  name: unknown;
  /** Байты файла из поля `file`; `null` — файла в запросе нет. */
  archive: Uint8Array | null;
  employeeId: string;
};

export const createLanding = async (request: CreateLandingRequest): Promise<LandingCreated> => {
  const name = readLandingName(request.name);

  if (request.archive === null) {
    throw new LandingFailure('landing_archive_invalid');
  }

  const inspection = inspectLandingArchive(request.archive);
  const { landingId, versionId } = await insertLandingWithFirstVersion(name, {
    html: inspection.html,
    passed: inspection.passed,
    checks: inspection.checks,
    uploadedByEmployeeId: request.employeeId,
  });

  await writeVersionFilesOrRollback(versionId, inspection, async () => {
    await deleteLandingWithVersions(landingId);
  });

  return { id: landingId, passed: inspection.passed };
};
