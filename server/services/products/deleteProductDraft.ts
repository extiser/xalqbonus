import { consola } from 'consola';
import { deleteProductPhoto } from '#server/adapters/uploads/productPhotos';
import { deleteProductDraft as deleteDraftRow, findProduct } from '#server/repositories/products';
import { ProductNotDraftError, UnknownProductError } from '#server/services/products/errors';
import { FOREIGN_KEY_VIOLATION, isConstraintViolation } from '#server/utils/postgresErrors';

/**
 * Удаление черновика товара — вместе с файлом фото (issue #148).
 *
 * Физическое, а не архивом: на черновик никто не ссылается по построению — заказать его
 * нельзя, в офис он не принимается. Опубликованный товар по-прежнему только архивируется:
 * на него ссылаются позиции заказов и журнал остатков.
 *
 * Порядок — сначала строка, потом файл: обратный дал бы черновик со ссылкой на файл, которого
 * нет. Упавшее удаление файла удаление не отменяет — черновика уже нет, а оставшийся файл —
 * мусор на томе, а не поломка.
 *
 * Брошенные черновики сами не чистятся: человек может вернуться к недописанному через неделю,
 * и запись, исчезнувшая по возрасту, выглядит как потеря работы.
 */
const log = consola.withTag('products:delete');

export const deleteProductDraft = async (productId: string): Promise<void> => {
  let deleted;

  try {
    deleted = await deleteDraftRow(productId);
  } catch (error) {
    // Ссылку на черновик сервисы не заводят. Если она всё же есть, удалять нельзя — отвечаем
    // тем же, что у опубликованного, а не пятисоткой.
    if (isConstraintViolation(error, FOREIGN_KEY_VIOLATION)) {
      throw new ProductNotDraftError(productId);
    }

    throw error;
  }

  if (!deleted) {
    if (!(await findProduct(productId))) {
      throw new UnknownProductError(productId);
    }

    throw new ProductNotDraftError(productId);
  }

  if (deleted.photoPath !== null) {
    try {
      await deleteProductPhoto(deleted.photoPath);
    } catch (error) {
      log.warn('черновик товара удалён, но файл фото с тома не удалился', {
        productId,
        photoPath: deleted.photoPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log.info('черновик товара удалён', { productId, photoPath: deleted.photoPath });
};
