import { mkdirSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import { MAILING_PHOTO_DIR, readUploadsDir } from '#server/adapters/uploads/config';
// Относительным путём, а не через `#shared`: этот модуль собирается ещё и в воркер,
// а бандл воркера знает только псевдоним `#server` (package.json → build:worker).
import { PHOTO_EXTENSION_BY_TYPE } from '../../../shared/photo';

/**
 * Файлы фото рассылок на томе приложения — том же, где фото товаров (issue #136).
 *
 * Адаптер файловой системы тома, про базу он не знает ничего: колонку `mailings.photo_path`
 * пишет сервис. Имя файла — uuid рассылки и расширение по типу содержимого; имя, присланное
 * клиентом, не используется нигде (server/adapters/uploads/productPhotos.ts).
 *
 * Читает эти файлы не только приложение, но и воркер: фото уходит в Telegram из очереди.
 * Поэтому том смонтирован в оба контейнера.
 */

const fileNameFor = (mailingId: string, extension: string): string => `${mailingId}.${extension}`;

const photoDir = (): string => join(readUploadsDir(), MAILING_PHOTO_DIR);

/**
 * Заводит подкаталог фото рассылок. Зовётся на старте приложения рядом с проверкой тома —
 * по той же причине, что подкаталог товаров: права на запись проверяются до первой загрузки.
 */
export const ensureMailingPhotoDir = (): void => {
  mkdirSync(photoDir(), { recursive: true });
};

/** Снимает файлы той же рассылки с другими расширениями. Отказ удаления загрузку не роняет. */
const removeOtherPhotos = async (
  dir: string,
  mailingId: string,
  keepExtension: string,
): Promise<void> => {
  const stale = Object.values(PHOTO_EXTENSION_BY_TYPE)
    .filter((extension) => extension !== keepExtension)
    .map((extension) => fileNameFor(mailingId, extension));

  const present = new Set(await readdir(dir));

  await Promise.all(
    stale
      .filter((name) => present.has(name))
      .map((name) => unlink(join(dir, name)).catch(() => undefined)),
  );
};

/** Кладёт фото на том и возвращает относительный путь для колонки рассылки. */
export const writeMailingPhoto = async (
  mailingId: string,
  contentType: string,
  bytes: Buffer,
): Promise<string> => {
  const extension = PHOTO_EXTENSION_BY_TYPE[contentType];

  if (!extension) {
    throw new Error(`тип ${contentType} не принимается: адаптер зовут после проверки типа`);
  }

  const dir = photoDir();

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileNameFor(mailingId, extension)), bytes);
  await removeOtherPhotos(dir, mailingId, extension);

  return `${MAILING_PHOTO_DIR}/${fileNameFor(mailingId, extension)}`;
};

/**
 * Имя файла фото из относительного пути колонки, если оно нашего вида. `null` — путь не наш,
 * и открывать по нему нечего: `..` в колонке — то, ради чего сверка и стоит.
 */
const PHOTO_FILE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

const fileNameOfPath = (photoPath: string): string | null => {
  const fileName = basename(photoPath);

  return photoPath === `${MAILING_PHOTO_DIR}/${fileName}` && PHOTO_FILE_NAME.test(fileName)
    ? fileName
    : null;
};

/**
 * Копирует фото рассылки под другую рассылку — так копия рассылки получает свою
 * картинку, а не ссылку на чужую: замена фото в копии иначе переписала бы файл оригинала.
 */
export const copyMailingPhoto = async (photoPath: string, toMailingId: string): Promise<string> => {
  const fileName = fileNameOfPath(photoPath);

  if (!fileName) {
    throw new Error(`путь фото рассылки не нашего вида: ${photoPath}`);
  }

  const targetName = fileNameFor(toMailingId, extname(fileName).slice(1));
  const dir = photoDir();

  await mkdir(dir, { recursive: true });
  await copyFile(join(dir, fileName), join(dir, targetName));

  return `${MAILING_PHOTO_DIR}/${targetName}`;
};

/**
 * Удаляет файл фото с тома. Файла уже нет — не отказ: снимать нечего, и повтор снятия
 * обязан отвечать тем же, что первое.
 */
export const deleteMailingPhoto = async (photoPath: string): Promise<void> => {
  const fileName = fileNameOfPath(photoPath);

  if (!fileName) {
    throw new Error(`путь фото рассылки не нашего вида: ${photoPath}`);
  }

  try {
    await unlink(join(photoDir(), fileName));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }
};

/** Байты фото и имя файла — для выгрузки в Telegram. */
export const readMailingPhoto = async (
  photoPath: string,
): Promise<{ bytes: Buffer; fileName: string }> => {
  const fileName = fileNameOfPath(photoPath);

  if (!fileName) {
    throw new Error(`путь фото рассылки не нашего вида: ${photoPath}`);
  }

  return { bytes: await readFile(join(photoDir(), fileName)), fileName };
};

/** Путь файла по его имени — для ручки, которая отдаёт картинку. `null` — имя не наше. */
export const resolveMailingPhotoFile = (fileName: string): string | null =>
  PHOTO_FILE_NAME.test(fileName) ? join(photoDir(), fileName) : null;
