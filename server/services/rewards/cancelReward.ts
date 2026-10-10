import { consola } from 'consola';
import { db } from '#server/db';
import type { RewardStatus } from '#server/generated/prisma/enums';
import { lockPersonRewardById, markRewardCancelled } from '#server/repositories/rewards';
import { lockStockRows, writeStockMovement } from '#server/repositories/stock';
import type { EmployeeActor } from '#server/services/employees/roles';
import { RewardNotCancellableError, UnknownRewardError } from '#server/services/rewards/errors';
import { readDriverReward } from '#server/services/rewards/readDriverRewards';
import type { DriverReward } from '#shared/types/rewards';

/**
 * Отмена ждущей награды из карточки водителя (issue #270) — выданной по ошибке.
 *
 * Отменяется только ждущее: товар и произвольная в офисе (`awaiting`) и незабранный подарок
 * (`claimable`). Выданное на стойке и зачисленное не отменяется. Журнал баллов отмена
 * не трогает: зачисленное она не отменяет, а у подарка до зачисления баллов на балансе нет.
 * Водителю ничего не уходит — награда молча уходит в отменённые.
 *
 * Одна транзакция, порядок блокировок как у сгорания: сначала награда, потом остаток. Выдача
 * на стойке, сгорание и зачисление подарка берут ту же строку `FOR UPDATE`, поэтому кто взял
 * её первым, тот и прав, а второй видит новый статус и получает свой штатный исход.
 */

const log = consola.withTag('rewards:cancel');

/** Статусы, из которых награду можно отменить. */
const CANCELLABLE_STATUSES: readonly RewardStatus[] = ['awaiting', 'claimable'];

export type CancelRewardInput = {
  actor: EmployeeActor;
  personId: string;
  rewardId: string;
  now?: Date;
};

export const cancelReward = async ({
  actor,
  personId,
  rewardId,
  now = new Date(),
}: CancelRewardInput): Promise<DriverReward> => {
  const previousStatus = await db.$transaction(async (transaction) => {
    const reward = await lockPersonRewardById(transaction, rewardId, personId);

    if (!reward) {
      throw new UnknownRewardError(rewardId);
    }

    if (!CANCELLABLE_STATUSES.includes(reward.status)) {
      throw new RewardNotCancellableError(reward.id, reward.status);
    }

    // Штука товара ждёт в резерве офиса и возвращается в свободный остаток тем же движением,
    // что при сгорании. Товар и офис у награды-товара есть всегда — проверкой
    // `rewards_kind_fields_check`.
    const shelf =
      reward.kind === 'product' && reward.officeId !== null && reward.productId !== null
        ? { officeId: reward.officeId, productId: reward.productId }
        : null;

    if (shelf) {
      await lockStockRows(transaction, shelf.officeId, [shelf.productId]);
    }

    if ((await markRewardCancelled(transaction, reward.id, actor.employeeId, now)) !== 1) {
      throw new Error(`отмена награды ${reward.id} не изменила ни одной строки`);
    }

    if (shelf) {
      await writeStockMovement(transaction, {
        officeId: shelf.officeId,
        productId: shelf.productId,
        kind: 'reward_release',
        deltaOnHand: 1,
        deltaReserved: -1,
        rewardId: reward.id,
        employeeId: actor.employeeId,
      });
    }

    return reward.status;
  });

  log.info('награда отменена', { rewardId, personId, employeeId: actor.employeeId, previousStatus });

  const cancelled = await readDriverReward(personId, rewardId);

  if (!cancelled) {
    throw new Error(`отменённая награда ${rewardId} не прочиталась`);
  }

  return cancelled;
};
