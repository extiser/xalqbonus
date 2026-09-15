import { accessSync, constants, mkdirSync } from 'node:fs';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { PRODUCT_PHOTO_DIR, readUploadsDir } from '#server/adapters/uploads/config';
import { PHOTO_EXTENSION_BY_TYPE } from '#shared/photo';

/**
 * Файлы фото товаров на томе приложения.
 *
 * Адаптер внешней системы — файловой системы тома, — и про базу он не знает ничего:
 * колонку `products.photo_path` пишет сервис, здесь только байты и имена
 * (docs/principles.md → «Слои и зависимости»).
 *
 * Имя файла собирается из uuid товара и расширения по типу содержимого. Имя, присланное
 * клиентом, не используется нигде: в нём приезжает и путь с `..`, и второе расширение.
 */

/** Имя файла фото: uuid товара и расширение. Отсюда же его читает отдающая ручка. */
const fileNameFor = (productId: string, extension: string): string =>
  `${productId}.${extension}`;

/** Каталог фото на томе. */
const photoDir = (): string => join(readUploadsDir(), PRODUCT_PHOTO_DIR);

/**
 * Существует ли каталог тома и можно ли в него писать.
 *
 * Спрашивается на старте приложения: том, смонтированный только на чтение или отданный
 * не тому пользователю, иначе обнаружился бы первой неудачной загрузкой — то есть тогда,
 * когда сотрудник парка уже сидит перед формой (issue #120).
 *
 * **Проверка синхронная, и это не вкусовщина.** Отказ плагина Nitro останавливает старт
 * только тогда, когда исключение поднято синхронно: асинхронное приезжает необработанным
 * промисом уже после того, как сервер начал слушать порт. Замерено 13-09-2026 на собранном
 * образе с `UPLOADS_DIR=/data/net-takogo`: в логе `[unhandledRejection]`, а приложение
 * работает и отвечает — то есть ровно то состояние «загрузка молча не работает», ради
 * запрета которого проверка и написана. Синхронный отказ выходит кодом 1, как разбор режима
 * бота (`server/plugins/bot.ts`).
 *
 * Подкаталог фото заводится здесь же: на пустом томе его нет, и создание его на первой
 * загрузке означало бы, что права на запись проверены поздно.
 */
export const ensureUploadsWritable = (): void => {
  const root = readUploadsDir();

  try {
    accessSync(root, constants.W_OK | constants.X_OK);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(
      `каталог тома ${root} недоступен на запись: ${reason}.` +
        ' Проверьте UPLOADS_DIR и монтирование тома uploads',
      { cause: error },
    );
  }

  mkdirSync(photoDir(), { recursive: true });
};

/**
 * Снимает файлы того же товара с другими расширениями.
 *
 * Отказ удаления не роняет загрузку: фото уже лежит и уже записано в колонку, а оставшийся
 * лишний файл — мусор на томе, а не поломка. Ронять на нём загрузку значило бы отказать
 * человеку в том, что уже получилось.
 */
const removeOtherPhotos = async (
  dir: string,
  productId: string,
  keepExtension: string,
): Promise<void> => {
  const stale = Object.values(PHOTO_EXTENSION_BY_TYPE)
    .filter((extension) => extension !== keepExtension)
    .map((extension) => fileNameFor(productId, extension));

  const present = new Set(await readdir(dir));

  await Promise.all(
    stale
      .filter((name) => present.has(name))
      .map((name) => unlink(join(dir, name)).catch(() => undefined)),
  );
};

/**
 * Кладёт фото на том и возвращает относительный путь для колонки товара.
 *
 * Прежнее фото того же товара уходит: при том же расширении файл перезаписывается,
 * при другом — удаляется по имени, потому что иначе на томе остался бы файл, на который
 * больше никто не ссылается, и отличить его от нужного через год было бы нечем.
 */
export const writeProductPhoto = async (
  productId: string,
  contentType: string,
  bytes: Buffer,
): Promise<string> => {
  const extension = PHOTO_EXTENSION_BY_TYPE[contentType];

  if (!extension) {
    throw new Error(`тип ${contentType} не принимается: адаптер зовут после проверки типа`);
  }

  const dir = photoDir();

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileNameFor(productId, extension)), bytes);
  await removeOtherPhotos(dir, productId, extension);

  return `${PRODUCT_PHOTO_DIR}/${fileNameFor(productId, extension)}`;
};

/**
 * Путь файла фото по его имени — для ручки, которая его отдаёт.
 *
 * Имя сверяется с образцом «uuid и известное расширение», а не склеивается с каталогом
 * как пришло: `..%2f..%2f.env` в адресе — это то, ради чего проверка здесь и стоит.
 * `null` — имя не наше, и открывать по нему нечего.
 */
const PHOTO_FILE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

export const resolveProductPhotoFile = (fileName: string): string | null =>
  PHOTO_FILE_NAME.test(fileName) ? join(photoDir(), fileName) : null;

/**
 * Удаляет файл фото с тома — вместе с черновиком товара (issue #148). Путь сверяется с тем,
 * что пишет `writeProductPhoto`: `..` в колонке — то, ради чего сверка и стоит.
 *
 * Файла уже нет — не отказ: снимать нечего, и повтор удаления обязан отвечать тем же.
 */
export const deleteProductPhoto = async (photoPath: string): Promise<void> => {
  const fileName = basename(photoPath);

  if (photoPath !== `${PRODUCT_PHOTO_DIR}/${fileName}` || !PHOTO_FILE_NAME.test(fileName)) {
    throw new Error(`путь фото товара не нашего вида: ${photoPath}`);
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
