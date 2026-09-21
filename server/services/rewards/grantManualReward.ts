import { randomUUID } from 'node:crypto';

import type { RewardRow } from '#server/repositories/rewards';
import { buildManualIdempotencyKey } from '#server/services/points/idempotencyKey';
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
 * сколько держать товар на полке, знает парк, а не программа. У баллов срока нет вовсе.
 *
 * Баллы идут причиной `manual` с ключом `manual:<uuid>` — тем же, что ручная правка
 * (docs/points.md): это одна операция по одному человеку, заведённая сотрудником. Ключ
 * выдаётся на запрос, а не приходит от клиента, — довод тот же, что у `adjustPointsManually`.
 */

export type ManualRewardInput = {
  personId: string;
  employeeId: string;
  /** Как пришло: вид проверяется здесь. */
  kind: string;
  points: number | null;
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
    if (!isPositiveInteger(input.points)) {
      throw new InvalidManualRewardError('points_invalid');
    }

    return {
      kind: 'points',
      points: input.points,
      reason: 'manual',
      idempotencyKey: buildManualIdempotencyKey(randomUUID()),
    };
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
