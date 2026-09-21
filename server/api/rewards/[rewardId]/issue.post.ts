import { issueOfficeReward } from '#server/services/rewards/issueOfficeReward';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { explainOfficeOrderFailure } from '#server/utils/officeOrderFailure';
import { requireUuidParam } from '#server/utils/query';
import { ORDER_ROLES } from '#shared/access';
import type { OfficeRewardResponse } from '#shared/types/rewards';

// Выдача награды вошедшим сотрудником на стойке. Второе нажатие отвечает «награда уже выдана»:
// второй операции не делает сервис, ручка только показывает.
export default defineEventHandler(async (event): Promise<OfficeRewardResponse> => {
  const employee = await requireEmployeeRole(event, ORDER_ROLES);
  const rewardId = requireUuidParam(event, 'rewardId');

  try {
    return { reward: await issueOfficeReward(employee, rewardId) };
  } catch (error) {
    throw explainOfficeOrderFailure(error) ?? error;
  }
});
