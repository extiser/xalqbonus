import type { CampaignChestKind, RewardKind } from '#server/generated/prisma/enums';
import type { CampaignPrizeInput, CampaignPrizeRow } from '#server/repositories/campaignPrizes';
import { InvalidCampaignPrizesError } from '#server/services/campaigns/errors';
import { readUuid } from '#server/utils/query';
import { CAMPAIGN_CHESTS, isDrawnChest } from '#shared/campaign';
import type { CampaignChestPrizes } from '#shared/types/campaign';

/**
 * Перевод набора призов между строкой базы, контрактом ручки и телом запроса (issue #180).
 * Операцией не является: нужен обеим ручкам призов.
 */

/** Сундуки по ступеням, каждый — даже пустой: пустой сундук экран обязан показать пустым. */
export const toChestPrizes = (rows: CampaignPrizeRow[]): CampaignChestPrizes[] =>
  CAMPAIGN_CHESTS.map((chest) => ({
    chest,
    prizes: rows
      .filter((row) => row.chest === chest)
      .map((row) => ({
        prizeId: row.id,
        kind: row.kind,
        weight: row.weight,
        points: row.points,
        productId: row.productId,
        productName: row.productName,
        productArchived: row.productArchivedAt !== null,
        title: row.title,
      })),
  }));

/** Строка тела так, как её видит разбор: всё `unknown`, типом присланному не верим. */
type CampaignPrizeRequestFields = {
  chest?: unknown;
  kind?: unknown;
  weight?: unknown;
  points?: unknown;
  productId?: unknown;
  title?: unknown;
};

export type CampaignPrizesRequestFields = {
  prizes?: unknown;
};

const REWARD_KINDS: readonly RewardKind[] = ['points', 'product', 'custom'];

const readText = (value: unknown): string | null => {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';

  return text === '' ? null : text;
};

/** Целое число больше нуля или `null`, если это не оно. */
const readPositiveInteger = (value: unknown): number | null => {
  const text = readText(value);
  const number = text === null ? Number.NaN : Number(text);

  return Number.isInteger(number) && number > 0 ? number : null;
};

const readChest = (value: unknown): CampaignChestKind | null =>
  CAMPAIGN_CHESTS.find((chest) => chest === value) ?? null;

const readKind = (value: unknown): RewardKind | null =>
  REWARD_KINDS.find((kind) => kind === value) ?? null;

const readPrize = (row: CampaignPrizeRequestFields): CampaignPrizeInput => {
  const chest = readChest(row.chest);
  const kind = readKind(row.kind);

  if (chest === null || kind === null) {
    throw new InvalidCampaignPrizesError('prizes_malformed', chest);
  }

  // У фиксированного сундука вес не набирается и не значит ничего: делить нечего.
  const weight = isDrawnChest(chest) ? readPositiveInteger(row.weight) : 1;

  if (weight === null) {
    throw new InvalidCampaignPrizesError('weight_invalid', chest);
  }

  // Поля не своего вида не читаются вовсе: строка приза несёт ровно своё значение.
  if (kind === 'points') {
    const points = readPositiveInteger(row.points);

    if (points === null) {
      throw new InvalidCampaignPrizesError('points_invalid', chest);
    }

    return { chest, kind, weight, points, productId: null, title: null };
  }

  if (kind === 'product') {
    const productId = readUuid(readText(row.productId));

    if (productId === null) {
      throw new InvalidCampaignPrizesError('product_invalid', chest);
    }

    return { chest, kind, weight, points: null, productId, title: null };
  }

  const title = readText(row.title);

  if (title === null) {
    throw new InvalidCampaignPrizesError('title_missing', chest);
  }

  return { chest, kind, weight, points: null, productId: null, title };
};

/**
 * Набор призов из тела запроса. Пустой набор законен: черновик может ещё не знать призов,
 * а чего не хватает для запуска, решает запуск.
 */
export const readCampaignPrizeFields = (
  body: CampaignPrizesRequestFields | null | undefined,
): CampaignPrizeInput[] => {
  const rows: unknown = body?.prizes;

  if (!Array.isArray(rows)) {
    throw new InvalidCampaignPrizesError('prizes_malformed', null);
  }

  const prizes = rows.map((row: unknown) => {
    if (typeof row !== 'object' || row === null) {
      throw new InvalidCampaignPrizesError('prizes_malformed', null);
    }

    return readPrize(row as CampaignPrizeRequestFields);
  });

  // Отказ словами про сундук раньше, чем словами про индекс `campaign_prizes_fixed_chest_key`.
  for (const chest of CAMPAIGN_CHESTS) {
    if (!isDrawnChest(chest) && prizes.filter((prize) => prize.chest === chest).length > 1) {
      throw new InvalidCampaignPrizesError('fixed_chest_duplicate', chest);
    }
  }

  return prizes;
};
