import { findPendingOfficeOrderByCode, listOrderLines } from '#server/repositories/orders';
import { findAwaitingOfficeRewardByCode } from '#server/repositories/rewards';
import { DeskCodeNotFoundError } from '#server/services/desk/errors';
import { requireOpenOffice, type OfficeWorker } from '#server/services/offices/employeeOffices';
import { describeOfficeOrder } from '#server/services/orders/officeOrderView';
import { describeOfficeReward } from '#server/services/rewards/officeRewardView';
import type { DeskItemResponse } from '#shared/types/rewards';

/**
 * Что ждёт выдачи по коду, названному водителем у стойки, — заказ или награда (issue #172).
 *
 * Поле кода у стойки одно: сотрудник набирает пять цифр и не решает заранее, что перед ним.
 * Решает первая цифра — заказы рождаются с `0`–`4`, награды с `5`–`9` (`orderCode.ts`), —
 * поэтому поиск идёт ровно в одну таблицу, и двух находок на один код не бывает.
 *
 * Сначала проверяется, что офис открыт сотруднику: иначе менеджер перебором офисов узнавал бы,
 * где висит код. Дальше код ищется **в офисе**, и чужой офис отвечает тем же «не найден», что
 * и несуществующий код. Строка, не похожая на код, до базы не доходит и получает тот же ответ.
 */

const CODE = /^\d{5}$/;

/** Первая цифра кода награды: `5`–`9`. */
const REWARD_CODE = /^[5-9]/;

export const findDeskItemByCode = async (
  worker: OfficeWorker,
  officeId: string,
  code: string,
): Promise<DeskItemResponse> => {
  await requireOpenOffice(worker, officeId);

  if (!CODE.test(code)) {
    throw new DeskCodeNotFoundError(code);
  }

  if (REWARD_CODE.test(code)) {
    const reward = await findAwaitingOfficeRewardByCode(officeId, code);

    if (!reward) {
      throw new DeskCodeNotFoundError(code);
    }

    return { kind: 'reward', reward: describeOfficeReward(reward) };
  }

  const order = await findPendingOfficeOrderByCode(officeId, code);

  if (!order) {
    throw new DeskCodeNotFoundError(code);
  }

  return { kind: 'order', order: describeOfficeOrder(order, await listOrderLines([order.id])) };
};
