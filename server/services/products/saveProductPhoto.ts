import { consola } from 'consola';
import { writeProductPhoto } from '#server/adapters/uploads/productPhotos';
import { findProduct, updateProductPhotoPath } from '#server/repositories/products';
import {
  PhotoTooLargeError,
  PhotoTypeNotAllowedError,
  UnknownProductError,
} from '#server/services/products/errors';
import { toProduct } from '#server/services/products/fields';
import { MAX_PHOTO_BYTES, PHOTO_EXTENSION_BY_TYPE } from '#shared/photo';
import type { Product } from '#shared/types/catalog';

/**
 * Фото товара: файл на том, относительный путь в колонку.
 *
 * Порядок именно такой — сначала файл, потом колонка. Обратный порядок дал бы товар
 * со ссылкой на файл, которого нет, а этот — файл, на который никто не ссылается: мусор
 * на томе вместо битой картинки в каталоге.
 *
 * Транзакции здесь нет и быть не может: файловая система в транзакцию базы не входит.
 * Поэтому единственное, что здесь гарантируется, — этот порядок.
 *
 * Тип и размер проверяются до записи. На клиенте те же ограничения стоят свойством поля
 * — `accept` и проверка размера при выборе, — и до сюда доходит только обойдённый
 * или кривой клиент (`docs/frontend.md` → «Обязательное поле — свойство поля»).
 */
const log = consola.withTag('products:photo');

export type SaveProductPhotoInput = {
  productId: string;
  contentType: string;
  bytes: Buffer;
};

export const saveProductPhoto = async (input: SaveProductPhotoInput): Promise<Product> => {
  if (!PHOTO_EXTENSION_BY_TYPE[input.contentType]) {
    throw new PhotoTypeNotAllowedError(input.contentType);
  }

  if (input.bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new PhotoTooLargeError(input.bytes.byteLength, MAX_PHOTO_BYTES);
  }

  // Товар спрашивается до записи файла: фото товара, которого нет, легло бы на том
  // навсегда — удалять его было бы некому и незачем.
  const product = await findProduct(input.productId);

  if (!product) {
    throw new UnknownProductError(input.productId);
  }

  const photoPath = await writeProductPhoto(input.productId, input.contentType, input.bytes);
  const row = await updateProductPhotoPath(input.productId, photoPath);

  if (!row) {
    throw new UnknownProductError(input.productId);
  }

  log.info('фото записано', {
    productId: input.productId,
    photoPath,
    bytes: input.bytes.byteLength,
  });

  return toProduct(row);
};
