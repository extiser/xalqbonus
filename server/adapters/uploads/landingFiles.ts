import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { LANDING_DIR, readUploadsDir } from '#server/adapters/uploads/config';
import { landingImageContentType, normalizeLandingPath } from '#shared/landings';

/**
 * Картинки лендингов на томе приложения (issue #478): `landings/<id версии>/<путь из архива>`.
 *
 * Адаптер файловой системы тома, про базу не знает: какие версии есть, решает сервис, здесь
 * только байты и пути (docs/principles.md → «Слои и зависимости»).
 *
 * Каталог — на версию, а не на лендинг: содержимое версии после записи не меняется, и адрес
 * картинки можно отдавать с вечным кэшем. Замена архива ложится в новый каталог.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Каталог версии. Id сверяется с видом uuid: он ложится в путь на диске. */
const versionDir = (versionId: string): string => {
  if (!UUID_PATTERN.test(versionId)) {
    throw new Error(`id версии лендинга не uuid: ${versionId}`);
  }

  return join(readUploadsDir(), LANDING_DIR, versionId);
};

export type LandingFile = {
  /** Путь внутри архива. */
  path: string;
  bytes: Uint8Array;
};

/**
 * Кладёт картинки версии на том. Путь каждого файла проверяется заново, а не берётся как есть:
 * `..` в пути из архива — то, ради чего проверка и стоит, и адаптер не полагается на то,
 * что её сделал кто-то до него.
 */
export const writeLandingVersionFiles = async (versionId: string, files: readonly LandingFile[]): Promise<void> => {
  const root = versionDir(versionId);

  await mkdir(root, { recursive: true });

  for (const file of files) {
    const path = normalizeLandingPath(file.path);

    if (path === null || landingImageContentType(path) === null) {
      throw new Error(`путь картинки лендинга не нашего вида: ${file.path}`);
    }

    const target = join(root, path);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
  }
};

/** Удаляет каталог версии целиком. Каталога нет — не отказ: повтор удаления отвечает тем же. */
export const deleteLandingVersionDir = async (versionId: string): Promise<void> => {
  await rm(versionDir(versionId), { recursive: true, force: true });
};

/**
 * Файл картинки версии на томе — для ручки, которая его отдаёт. `null` — путь не наш: не uuid
 * версии, `..`, не картинка. HTML и всё, что не картинка, отсюда не открывается никогда:
 * лендинг попадает в страницу только разметкой через компонент приложения.
 */
export const resolveLandingFile = (
  versionId: string,
  filePath: string,
): { path: string; contentType: string } | null => {
  if (!UUID_PATTERN.test(versionId)) return null;

  const path = normalizeLandingPath(filePath);
  const contentType = path === null ? null : landingImageContentType(path);

  if (path === null || contentType === null) return null;

  return { path: join(versionDir(versionId), path), contentType };
};
