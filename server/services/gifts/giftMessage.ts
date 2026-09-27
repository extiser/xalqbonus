import { consola } from 'consola';
import { deleteGiftCover, writeGiftCover } from '#server/adapters/uploads/giftCovers';
import { InvalidGiftGrantError, type GiftGrantLanguage } from '#server/services/gifts/errors';
import { mailingMessageLimit } from '#shared/mailing';
import { MAX_PHOTO_BYTES, PHOTO_EXTENSION_BY_TYPE } from '#shared/photo';

/**
 * Свой текст сообщения и обложки — правила, общие у подарка (issue #236) и ручной награды
 * (issue #266): сообщение о награде устроено ровно как о подарке, и отказы у них одни — те же
 * коды и поля, `InvalidGiftGrantError`.
 *
 * Обложки — обе или ни одной; ложатся на том под идентификатор, выданный до записи, — сначала
 * файл, потом колонка. Не записалось то, подо что их положили, — файлы снимаются.
 */

const log = consola.withTag('gifts:message');

/** Обложка, как её прислали: тип и размер проверяются здесь. */
export type GiftCoverUpload = { contentType: string; bytes: Buffer };

/** Обложки на каждом языке, как пришли. */
export type GiftCoverUploads = { coverRu: GiftCoverUpload | null; coverUz: GiftCoverUpload | null };

/** Пути обложек на томе. Обе или ни одной — как их прислали. */
export type CoverPaths = { coverRuPath: string | null; coverUzPath: string | null };

const validateCover = (cover: GiftCoverUpload | null, language: GiftGrantLanguage): void => {
  if (cover === null) {
    return;
  }

  if (!PHOTO_EXTENSION_BY_TYPE[cover.contentType]) {
    throw new InvalidGiftGrantError('cover_type_invalid', { cover: language });
  }

  if (cover.bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new InvalidGiftGrantError('cover_too_large', { cover: language });
  }
};

/** Обложки — обе или ни одной. Одна и та же картинка в оба поля — законно. */
export const validateCovers = (covers: GiftCoverUploads): void => {
  if (covers.coverRu !== null && covers.coverUz === null) {
    throw new InvalidGiftGrantError('cover_pair_incomplete', { cover: 'uz' });
  }

  if (covers.coverRu === null && covers.coverUz !== null) {
    throw new InvalidGiftGrantError('cover_pair_incomplete', { cover: 'ru' });
  }

  validateCover(covers.coverRu, 'ru');
  validateCover(covers.coverUz, 'uz');
};

/** Свой текст после обрезки краёв. Пусто — `null`: водителю этого языка уходит системный. */
export const normalizeMessage = (message: string): string | null => {
  const trimmed = message.trim();

  return trimmed === '' ? null : trimmed;
};

/**
 * Сообщение влезает в Telegram. Длину меряет вызывающий — той же сборкой, что при отправке:
 * свой текст, пустая строка и системная строка. С обложкой сообщение становится подписью
 * к фото, и потолок вчетверо ниже.
 */
export const checkMessageLength = (length: number, language: GiftGrantLanguage, withCover: boolean): void => {
  const limit = mailingMessageLimit(withCover);

  if (length > limit) {
    throw new InvalidGiftGrantError(language === 'uz' ? 'message_uz_too_long' : 'message_ru_too_long', {
      excess: length - limit,
    });
  }
};

/**
 * Кладёт обложки на том под `ownerId` — раздачу или награду — и зовёт `write` с их путями.
 * `write` упал — снятые с тома файлы не переживают несостоявшуюся запись. Отказ снятия
 * не заслоняет исходную причину: она важнее файла, оставшегося на томе.
 */
export const withGiftCovers = async <Result>(
  ownerId: string,
  covers: GiftCoverUploads,
  write: (paths: CoverPaths) => Promise<Result>,
): Promise<{ paths: CoverPaths; result: Result }> => {
  const writtenCoverPaths: string[] = [];

  const writeCover = async (cover: GiftCoverUpload | null, language: GiftGrantLanguage): Promise<string | null> => {
    if (cover === null) {
      return null;
    }

    const coverPath = await writeGiftCover(ownerId, language, cover.contentType, cover.bytes);

    writtenCoverPaths.push(coverPath);

    return coverPath;
  };

  try {
    const paths: CoverPaths = {
      coverRuPath: await writeCover(covers.coverRu, 'ru'),
      coverUzPath: await writeCover(covers.coverUz, 'uz'),
    };

    return { paths, result: await write(paths) };
  } catch (error) {
    for (const coverPath of writtenCoverPaths) {
      await deleteGiftCover(coverPath).catch((cleanupError: unknown) => {
        log.warn('обложка несостоявшейся записи не снялась с тома', {
          ownerId,
          coverPath,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      });
    }

    throw error;
  }
};
