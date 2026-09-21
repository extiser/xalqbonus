import { findOfficeReward } from '#server/repositories/rewards';
import { requireOpenOffice, type OfficeWorker } from '#server/services/offices/employeeOffices';
import { RewardNotAwaitingError, UnknownRewardError } from '#server/services/rewards/errors';
import { issueReward } from '#server/services/rewards/issueReward';
import { readOfficeReward } from '#server/services/rewards/officeRewardView';
import type { OfficeReward } from '#shared/types/rewards';

/**
 * Выдача награды сотрудником — по награде, открытой на экране. Устроена как
 * `issueOfficeOrder`: выдачу делает `issueReward`, и только он, а здесь — два вопроса, которых
 * он не задаёт: открыт ли офис награды этому сотруднику и что сказать, если она уже не ждёт.
 *
 * Двойное нажатие второй операции не делает: второй запрос либо сразу видит `issued`, либо
 * получает отказ от `issueReward`, и тогда статус перечитывается — человек нажал кнопку под
 * наградой и должен узнать, что с ней стало.
 */
export const issueOfficeReward = async (
  worker: OfficeWorker,
  rewardId: string,
): Promise<OfficeReward> => {
  const reward = await findOfficeReward(rewardId);

  if (!reward) {
    throw new UnknownRewardError(rewardId);
  }

  await requireOpenOffice(worker, reward.officeId);

  if (reward.status !== 'awaiting') {
    throw new RewardNotAwaitingError(reward.id, reward.status);
  }

  try {
    await issueReward({ rewardId: reward.id, employeeId: worker.employeeId });
  } catch (error) {
    if (!(error instanceof RewardNotAwaitingError)) {
      throw error;
    }

    const current = await findOfficeReward(rewardId);

    throw new RewardNotAwaitingError(rewardId, current?.status ?? null);
  }

  const result = await readOfficeReward(rewardId);

  if (!result) {
    throw new Error(`выданная награда ${rewardId} не прочиталась`);
  }

  return result;
};
