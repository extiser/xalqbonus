import { listOfficeOrders, listOrderLines, type OrderLineRow } from '#server/repositories/orders';
import { listAwaitingOfficeRewards } from '#server/repositories/rewards';
import { requireOpenOffice, type OfficeWorker } from '#server/services/offices/employeeOffices';
import { groupLinesByOrder } from '#server/services/orders/memberOrderScreen';
import { describeOfficeOrder } from '#server/services/orders/officeOrderView';
import { describeOfficeReward } from '#server/services/rewards/officeRewardView';
import type { DeskItemResponse, DeskPendingResponse } from '#shared/types/rewards';

/**
 * «Ждут выдачи» у стойки (issue #250): висящие заказы и ждущие награды офиса одним списком,
 * свежие первыми.
 *
 * Список одним, а не двумя: на прогоне под полем кода наград не было вовсе, и менеджер узнавал
 * про награду, только когда водитель называл код. Порядок общий — по времени рождения,
 * заказы и награды вперемешку: кто пришёл последним, тот и сверху.
 */

/** Потолок каждой из двух выборок. Ждущих в офисе единицы, и листать их незачем. */
const PENDING_LIMIT = 100;

const createdAtOf = (item: DeskItemResponse): string =>
  item.kind === 'order' ? item.order.createdAt : item.reward.createdAt;

export const readDeskPending = async (
  worker: OfficeWorker,
  officeId: string,
): Promise<DeskPendingResponse> => {
  await requireOpenOffice(worker, officeId);

  const [orderRows, rewardRows] = await Promise.all([
    listOfficeOrders({ officeId, status: 'pending', limit: PENDING_LIMIT, offset: 0 }),
    listAwaitingOfficeRewards(officeId, PENDING_LIMIT),
  ]);

  const linesByOrder =
    orderRows.length === 0
      ? new Map<string, OrderLineRow[]>()
      : groupLinesByOrder(await listOrderLines(orderRows.map((row) => row.id)));

  const items: DeskItemResponse[] = [
    ...orderRows.map((row): DeskItemResponse => ({
      kind: 'order',
      order: describeOfficeOrder(row, linesByOrder.get(row.id) ?? []),
    })),
    ...rewardRows.map((row): DeskItemResponse => ({ kind: 'reward', reward: describeOfficeReward(row) })),
  ];

  // ISO-строки одной зоны сравниваются как строки — и по времени тоже.
  items.sort((left, right) => createdAtOf(right).localeCompare(createdAtOf(left)));

  return { officeId, items };
};
