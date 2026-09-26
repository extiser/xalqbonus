import { listActiveOffices } from '#server/repositories/offices';
import { listProducts } from '#server/repositories/products';
import { isGrantableProduct } from '#server/services/rewards/grantableProduct';
import type { RewardGrantOptionsResponse } from '#shared/types/rewards';

/**
 * Что можно выбрать в форме ручной выдачи: рабочие офисы и товары, которые выдаются наградой, —
 * опубликованные и не в архиве. Призы идут первыми: ради них форму обычно и открывают.
 *
 * Своей ручкой, а не списками каталога и офисов: те открыты владельцу и админу, а награду
 * выдаёт и менеджер — тем же правилом, что ручную правку баллов.
 *
 * `isDemo` — сторона (issue #212): демо-водителю и демо-акции — только демо-офисы, товары
 * живые и демо; живым — только живые офисы и товары. Выдача проверяет то же сама
 * (`grantReward`).
 */
export type RewardGrantOptionsRequest = {
  isDemo: boolean;
};

export const readRewardGrantOptions = async (
  request: RewardGrantOptionsRequest,
): Promise<RewardGrantOptionsResponse> => {
  const [offices, products] = await Promise.all([
    listActiveOffices(request.isDemo),
    listProducts(),
  ]);

  return {
    offices: offices.map((office) => ({
      officeId: office.id,
      name: office.name,
      isDemo: office.isDemo,
    })),
    products: products
      .flatMap((product) =>
        isGrantableProduct(product) &&
        product.name !== null &&
        (request.isDemo || !product.isDemo)
          ? [
              {
                productId: product.id,
                name: product.name,
                promo: product.promo,
                isDemo: product.isDemo,
              },
            ]
          : [],
      )
      .sort((left, right) => Number(right.promo) - Number(left.promo)),
  };
};
