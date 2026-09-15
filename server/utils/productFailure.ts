import { createError, type H3Error } from 'h3';

import {
  InvalidProductPriceError,
  PhotoTooLargeError,
  PhotoTypeNotAllowedError,
  ProductDraftError,
  ProductIncompleteError,
  ProductNotDraftError,
  UnknownProductError,
} from '#server/services/products/errors';
import { MAX_PHOTO_MB } from '#shared/photo';
import { productPublishProblemText } from '#shared/product';

/**
 * Что ответить сотруднику на доменный отказ ручки товаров.
 *
 * Отказы — строками при своих правилах, а не кодами словаря двери: они про предмет разговора,
 * а не про доступ (docs/decisions.md → «Отказ двери веба говорит кодом, а текст живёт
 * словарём»). Собраны в одном месте по той же причине, что у рассылок
 * (`server/utils/mailingFailure.ts`): ручек товаров семь, и семь копий «такого товара нет»
 * разошлись бы формулировкой.
 *
 * Причины неполного товара берутся из `shared/product.ts`: те же стоят у закрытой кнопки
 * публикации на экране.
 *
 * `null` — не отказ, а поломка: такое уходит пятисоткой.
 */

const reject = (
  statusCode: 400 | 404 | 409 | 413 | 415,
  statusMessage: string,
  message: string,
): H3Error => createError({ statusCode, statusMessage, message });

export const explainProductFailure = (error: unknown): H3Error | null => {
  if (error instanceof UnknownProductError) {
    return reject(404, 'Not Found', 'Такого товара нет.');
  }

  // Негодная цена — разобранный запрос с негодным значением.
  if (error instanceof InvalidProductPriceError) {
    return reject(400, 'Bad Request', `Не сохранено: ${error.message}.`);
  }

  // Все причины одним ответом — так же, как экран перечисляет их у кнопки.
  if (error instanceof ProductIncompleteError) {
    return reject(
      409,
      'Conflict',
      `Товару не хватает обязательных полей. ${error.problems.map(productPublishProblemText).join(' ')}`,
    );
  }

  if (error instanceof ProductNotDraftError) {
    return reject(
      409,
      'Conflict',
      'Удаляется только черновик. Опубликованный товар убирается в архив: на него ссылаются заказы.',
    );
  }

  if (error instanceof ProductDraftError) {
    return reject(409, 'Conflict', 'Черновик не архивируется — его удаляют.');
  }

  // 415, а не 400: тело разобрано и понято, не принимается именно его тип.
  if (error instanceof PhotoTypeNotAllowedError) {
    return reject(415, 'Unsupported Media Type', 'Фото принимается в JPEG, PNG или WebP.');
  }

  // 413 — ровно то, что этот отказ означает: файл понят, но велик.
  if (error instanceof PhotoTooLargeError) {
    return reject(413, 'Content Too Large', `Фото должно быть не больше ${MAX_PHOTO_MB} МБ.`);
  }

  return null;
};

/** Отказ в человеческом виде или исходная ошибка — для `catch` в ручке. */
export const rethrowProductFailure = (error: unknown): never => {
  throw explainProductFailure(error) ?? error;
};
