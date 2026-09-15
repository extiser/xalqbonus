import { findProduct } from '#server/repositories/products';
import { UnknownStockTargetError } from '#server/services/stock/errors';

/**
 * Товар, по которому можно двигать остаток: существует и опубликован.
 *
 * Черновик в офис не принимается и не правится: на черновик не должен ссылаться никто, иначе
 * его нельзя удалить (issue #148). В таблице остатков его нет, и сюда он доходит только
 * набранным руками запросом — отказ тот же, что у товара, которого нет: в каталоге его ещё нет.
 */
export const assertStockProduct = async (officeId: string, productId: string): Promise<void> => {
  const product = await findProduct(productId);

  if (!product || product.publishedAt === null) {
    throw new UnknownStockTargetError(officeId, productId);
  }
};
