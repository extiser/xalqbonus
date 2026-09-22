import { db } from '#server/db';
import { lockCampaignStatus } from '#server/repositories/campaigns';
import {
  replaceCampaignPrizeRows,
  type CampaignPrizeInput,
} from '#server/repositories/campaignPrizes';
import { findProductsByIds } from '#server/repositories/products';
import {
  CampaignPrizeProductUnavailableError,
  CampaignPrizesLockedError,
  UnknownCampaignError,
} from '#server/services/campaigns/errors';
import { readCampaignPrizes } from '#server/services/campaigns/readCampaignPrizes';
import type { CampaignPrizesResponse } from '#shared/types/campaign';

/**
 * Замена набора призов акции целиком, одной транзакцией (issue #180).
 *
 * Строка акции берётся под блокировку первой — ту же, что берёт запуск: замена и запуск идут
 * по очереди, и запуск не увидит набор наполовину, а замена не пройдёт у только что
 * запущенной акции.
 *
 * Товар варианта — опубликованный и не архивный, как в `grantReward`. Признак «для акции»
 * не обязателен: разыграть можно и товар каталога. Остаток не проверяется: резерв случается
 * в момент выдачи, и склад к открытию сундука всё равно изменится.
 */
export const replaceCampaignPrizes = async (
  campaignId: string,
  prizes: CampaignPrizeInput[],
): Promise<CampaignPrizesResponse> => {
  await db.$transaction(async (transaction) => {
    const status = await lockCampaignStatus(campaignId, transaction);

    if (status === null) {
      throw new UnknownCampaignError(campaignId);
    }

    if (status !== 'draft') {
      throw new CampaignPrizesLockedError(campaignId, status);
    }

    const productIds = [
      ...new Set(prizes.flatMap((prize) => (prize.productId === null ? [] : [prize.productId]))),
    ];
    const products = productIds.length === 0 ? [] : await findProductsByIds(productIds, transaction);

    for (const prize of prizes) {
      if (prize.productId === null) {
        continue;
      }

      const product = products.find((candidate) => candidate.id === prize.productId);

      if (!product || product.publishedAt === null || product.archivedAt !== null || !product.name) {
        throw new CampaignPrizeProductUnavailableError(prize.productId, prize.chest);
      }
    }

    await replaceCampaignPrizeRows(campaignId, prizes, transaction);
  });

  return readCampaignPrizes(campaignId);
};
