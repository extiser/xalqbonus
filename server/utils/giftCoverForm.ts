import { readMultipartFormData, type H3Event } from 'h3';

import type { GiftCoverUploads } from '#server/services/gifts/giftMessage';
import { GIFT_COVER_RU_FIELD, GIFT_COVER_UZ_FIELD } from '#shared/gift';

/**
 * Тело `multipart/form-data` с обложками на каждом языке — у раздачи подарка (issue #236)
 * и ручной награды (issue #266): поля строками, обложки файлами под `GIFT_COVER_RU_FIELD`
 * и `GIFT_COVER_UZ_FIELD`. Одним запросом — ни раздача, ни награда не правятся, и заводить
 * черновик ради картинки, как у рассылки, незачем.
 */

const COVER_FIELDS: Readonly<Record<string, keyof GiftCoverUploads>> = {
  [GIFT_COVER_RU_FIELD]: 'coverRu',
  [GIFT_COVER_UZ_FIELD]: 'coverUz',
};

/** Поля и файлы из тела. Имя поля без файла — строка; повтор имени берёт первое значение. */
export const readGiftCoverForm = async <Field extends string>(
  event: H3Event,
): Promise<{ fields: Partial<Record<Field, string>>; covers: GiftCoverUploads }> => {
  const parts = (await readMultipartFormData(event)) ?? [];
  const fields: Partial<Record<string, string>> = {};
  const covers: GiftCoverUploads = { coverRu: null, coverUz: null };

  for (const part of parts) {
    if (!part.name) {
      continue;
    }

    const coverKey = COVER_FIELDS[part.name];

    if (coverKey) {
      if (part.filename !== undefined && part.data.byteLength > 0 && covers[coverKey] === null) {
        covers[coverKey] = { contentType: (part.type ?? '').toLowerCase(), bytes: part.data };
      }

      continue;
    }

    fields[part.name] ??= part.data.toString('utf8');
  }

  return { fields, covers };
};
