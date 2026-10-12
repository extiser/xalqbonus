import { deleteLandingVersionDir, writeLandingVersionFiles } from '#server/adapters/uploads/landingFiles';
import { deleteLandingVersion } from '#server/repositories/landings';
import type { LandingInspection } from '#server/services/promo/inspectLandingArchive';
import { LandingFailure } from '#server/services/promo/landingFailure';
import { LANDING_NAME_MAX_LENGTH } from '#shared/landings';

/**
 * Общее у загрузки лендинга и замены (issue #478): название из формы и запись картинок версии
 * на том после строк в базе.
 */

/** Название: края обрезаются; пустое и длиннее 80 — `landing_name_invalid`. */
export const readLandingName = (value: unknown): string => {
  const name = typeof value === 'string' ? value.trim() : '';

  if (name === '' || name.length > LANDING_NAME_MAX_LENGTH) {
    throw new LandingFailure('landing_name_invalid');
  }

  return name;
};

/**
 * Кладёт картинки версии на том. Не легли — строки снимает `rollback`, недописанный каталог
 * убирается, ошибка уходит дальше: версия без картинок показала бы лендинг без них, и узнали бы
 * об этом из рекламы.
 */
export const writeVersionFilesOrRollback = async (
  versionId: string,
  inspection: LandingInspection,
  rollback: () => Promise<void>,
): Promise<void> => {
  try {
    await writeLandingVersionFiles(versionId, inspection.images);
  } catch (error) {
    await deleteLandingVersionDir(versionId).catch(() => undefined);
    await rollback();

    throw error;
  }
};

/** Откат замены — только её версия: лендинг и прежние версии остаются. */
export const rollbackVersion = (versionId: string) => (): Promise<void> => deleteLandingVersion(versionId);
