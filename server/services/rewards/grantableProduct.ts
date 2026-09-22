import type { ProductRow } from '#server/repositories/products';

/**
 * Выдаётся ли товар наградой: опубликован, не в архиве и с названием — черновик и архивный
 * не выдаются, как и не заказываются. Признак «для акции» не обязателен.
 *
 * Одно правило на всех, кто о нём спрашивает: выдачу награды, список для выбора, заведение
 * призов акции и её запуск (issue #180). Разойдись они — запуск пропустил бы приз, который
 * выдача потом отобьёт у открытого сундука.
 */
export const isGrantableProduct = (
  product: Pick<ProductRow, 'publishedAt' | 'archivedAt' | 'name'>,
): boolean => product.publishedAt !== null && product.archivedAt === null && product.name !== null;
