import { mkdirSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { GIFT_COVER_DIR, readUploadsDir } from '#server/adapters/uploads/config';
// Относительным путём, а не через `#shared`: этот модуль собирается ещё и в воркер,
// а бандл воркера знает только псевдоним `#server` (package.json → build:worker).
import { PHOTO_EXTENSION_BY_TYPE } from '../../../shared/photo';

/**
 * Обложки подарков на томе приложения — том же, где фото рассылок и товаров (issue #219).
 *
 * Устроено как фото рассылки (`mailingPhotos.ts`): адаптер файловой системы, про базу не знает
 * ничего, колонку `gift_grants.cover_path` пишет сервис. Имя файла — uuid раздачи и расширение
 * по типу содержимого; имя, присланное клиентом, не используется нигде.
 *
 * Обложка не заменяется: раздача не правится, и файл по своему адресу не меняется никогда.
 * Читает её и воркер — обложка уходит в Telegram из очереди уведомлений.
 */

const fileNameFor = (giftGrantId: string, extension: string): string => `${giftGrantId}.${extension}`;

const coverDir = (): string => join(readUploadsDir(), GIFT_COVER_DIR);

/** Заводит подкаталог обложек. Зовётся на старте приложения рядом с проверкой тома. */
export const ensureGiftCoverDir = (): void => {
  mkdirSync(coverDir(), { recursive: true });
};

/** Кладёт обложку на том и возвращает относительный путь для колонки раздачи. */
export const writeGiftCover = async (
  giftGrantId: string,
  contentType: string,
  bytes: Buffer,
): Promise<string> => {
  const extension = PHOTO_EXTENSION_BY_TYPE[contentType];

  if (!extension) {
    throw new Error(`тип ${contentType} не принимается: адаптер зовут после проверки типа`);
  }

  const dir = coverDir();

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileNameFor(giftGrantId, extension)), bytes);

  return `${GIFT_COVER_DIR}/${fileNameFor(giftGrantId, extension)}`;
};

const COVER_FILE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

/** Имя файла из пути колонки, если путь нашего вида. `..` в колонке — то, ради чего сверка стоит. */
const fileNameOfPath = (coverPath: string): string => {
  const fileName = basename(coverPath);

  if (coverPath !== `${GIFT_COVER_DIR}/${fileName}` || !COVER_FILE_NAME.test(fileName)) {
    throw new Error(`путь обложки подарка не нашего вида: ${coverPath}`);
  }

  return fileName;
};

/**
 * Удаляет обложку — когда раздача, под которую её положили, не записалась. Файла уже нет —
 * не отказ: снимать нечего.
 */
export const deleteGiftCover = async (coverPath: string): Promise<void> => {
  try {
    await unlink(join(coverDir(), fileNameOfPath(coverPath)));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }
};

/** Байты обложки и имя файла — для выгрузки в Telegram. */
export const readGiftCover = async (coverPath: string): Promise<{ bytes: Buffer; fileName: string }> => {
  const fileName = fileNameOfPath(coverPath);

  return { bytes: await readFile(join(coverDir(), fileName)), fileName };
};

/** Путь файла по его имени — для ручки, которая отдаёт картинку. `null` — имя не наше. */
export const resolveGiftCoverFile = (fileName: string): string | null =>
  COVER_FILE_NAME.test(fileName) ? join(coverDir(), fileName) : null;

/** Адрес обложки для разметки — тот, по которому её отдаёт `server/routes/uploads/gifts`. */
export const giftCoverUrl = (coverPath: string | null): string | null =>
  coverPath === null ? null : `/uploads/${coverPath}`;
