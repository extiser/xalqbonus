import type { RewardRow } from '#server/repositories/rewards';
import { InvalidManualRewardError } from '#server/services/rewards/errors';
import { grantReward, type RewardGift } from '#server/services/rewards/grantReward';

/**
 * Ручная выдача награды сотрудником из карточки водителя (issue #172): источник `manual`,
 * автор — сотрудник, пояснение обязательно.
 *
 * Здесь решается только то, что правило ручной выдачи: чего не хватает виду награды и годен ли
 * срок. Рождает награду `grantReward` — одна дверь на все источники.
 *
 * Срок задаёт тот, кто выдаёт, — тем же правилом, что у акции. Постоянного срока в коде нет:
 * сколько держать товар на полке, знает парк, а не программа.
 *
 * Баллы здесь не вручаются (issue #219): баллы из раздела «Награды» — всегда подарок
 * с «Забрать» (`services/gifts/grantGift.ts`), и одному водителю тоже, а зачислить сразу —
 * ручной правкой баллов (решение Руслана 25-09-2026).
 */

export type ManualRewardInput = {
  personId: string;
  employeeId: string;
  /** Как пришло: вид проверяется здесь. */
  kind: string;
  productId: string | null;
  title: string | null;
  officeId: string | null;
  lifetimeDays: number | null;
  note: string;
};

const isPositiveInteger = (value: number | null): value is number =>
  value !== null && Number.isInteger(value) && value > 0;

const requireOffice = (input: ManualRewardInput): string => {
  if (input.officeId === null) {
    throw new InvalidManualRewardError('office_missing');
  }

  return input.officeId;
};

const requireLifetime = (input: ManualRewardInput): number => {
  if (!isPositiveInteger(input.lifetimeDays)) {
    throw new InvalidManualRewardError('lifetime_invalid');
  }

  return input.lifetimeDays;
};

const buildGift = (input: ManualRewardInput): RewardGift => {
  if (input.kind === 'points') {
    throw new InvalidManualRewardError('points_via_gift');
  }

  if (input.kind === 'product') {
    if (input.productId === null) {
      throw new InvalidManualRewardError('product_missing');
    }

    return {
      kind: 'product',
      productId: input.productId,
      officeId: requireOffice(input),
      lifetimeDays: requireLifetime(input),
    };
  }

  if (input.kind === 'custom') {
    const title = input.title?.trim() ?? '';

    if (title === '') {
      throw new InvalidManualRewardError('title_missing');
    }

    return {
      kind: 'custom',
      title,
      officeId: requireOffice(input),
      lifetimeDays: requireLifetime(input),
    };
  }

  throw new InvalidManualRewardError('kind_invalid');
};

export const grantManualReward = async (input: ManualRewardInput): Promise<RewardRow> => {
  const note = input.note.trim();

  if (note === '') {
    throw new InvalidManualRewardError('note_missing');
  }

  return grantReward({
    personId: input.personId,
    gift: buildGift(input),
    origin: { source: 'manual', employeeId: input.employeeId, note },
  });
};
