import { listActiveOffices } from '#server/repositories/offices';
import { listProducts } from '#server/repositories/products';
import type { RewardGrantOptionsResponse } from '#shared/types/rewards';

/**
 * Что можно выбрать в форме ручной выдачи: рабочие офисы и товары, которые выдаются наградой, —
 * опубликованные и не в архиве. Призы идут первыми: ради них форму обычно и открывают.
 *
 * Своей ручкой, а не списками каталога и офисов: те открыты владельцу и админу, а награду
 * выдаёт и менеджер — тем же правилом, что ручную правку баллов.
 */
export const readRewardGrantOptions = async (): Promise<RewardGrantOptionsResponse> => {
  const [offices, products] = await Promise.all([listActiveOffices(), listProducts()]);

  return {
    offices: offices.map((office) => ({ officeId: office.id, name: office.name })),
    products: products
      .flatMap((product) =>
        product.publishedAt !== null && product.archivedAt === null && product.name !== null
          ? [{ productId: product.id, name: product.name, promo: product.promo }]
          : [],
      )
      .sort((left, right) => Number(right.promo) - Number(left.promo)),
  };
};
