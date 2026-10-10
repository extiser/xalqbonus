import { cancelReward } from '#server/services/rewards/cancelReward';
import { RewardNotCancellableError, UnknownRewardError } from '#server/services/rewards/errors';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { REWARD_GRANT_ROLES } from '#shared/access';
import type { DriverReward } from '#shared/types/rewards';

// Отмена ждущей награды из карточки водителя (issue #270). Доступ — тем же списком, что выдача
// награды одному водителю: кто может вручить, тот может и отменить вручённое по ошибке. Демо-награда
// отменяется так же — она не демо-сущность раздела, правило одно.
//
// Ответ — награда в том виде, в каком её отдаёт список (`rewards.get.ts`). Отказы доменных правил —
// строкой при своей ручке, как у ручной выдачи.
export default defineEventHandler(async (event): Promise<DriverReward> => {
  const employee = await requireEmployeeRole(event, REWARD_GRANT_ROLES);

  const personId = requireUuidParam(event, 'personId');
  const rewardId = requireUuidParam(event, 'rewardId');

  try {
    return await cancelReward({ actor: employee, personId, rewardId });
  } catch (error) {
    if (error instanceof UnknownRewardError) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'награды нет' });
    }

    if (error instanceof RewardNotCancellableError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: 'Отменить можно только ждущую награду. Эта уже выдана, зачислена, сгорела или отменена.',
      });
    }

    throw error;
  }
});
