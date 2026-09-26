import type { OrderStatus } from '#server/generated/prisma/enums';
import {
  countOfficeOrders,
  listOfficeOrders,
  listOrderLines,
  type OrderLineRow,
} from '#server/repositories/orders';
import { OfficeNotOpenError } from '#server/services/offices/errors';
import { readEmployeeOffices, type OfficeWorker } from '#server/services/offices/employeeOffices';
import { groupLinesByOrder } from '#server/services/orders/memberOrderScreen';
import { describeOfficeOrder } from '#server/services/orders/officeOrderView';
import type { OfficeOrdersResponse } from '#shared/types/orders';
// Значение — относительным путём: см. `server/services/offices/employeeOffices.ts`.
import { OFFICE_ORDER_STATUSES } from '../../../shared/types/orders';

/**
 * Заказы офиса страницей — для таблицы в вебе и списка висящих в Mini App.
 *
 * Офис в запросе необязателен: не спросили — берётся первый работающий из офисов сотрудника,
 * чтобы экран открывался сразу с заказами, а не с пустым выбором. Спросили чужой — отказ.
 *
 * Сотрудник без единого офиса получает отказ и здесь: заказов, которые ему можно показать,
 * не существует (issue #122). Отказ — `office_not_open`, как у чужого офиса (issue #250).
 */

export const DEFAULT_OFFICE_ORDERS_LIMIT = 25;

/** Потолок страницы. Заказов в офисе — десятки в месяц; больше сотни за раз не нужно никому. */
const MAX_OFFICE_ORDERS_LIMIT = 100;

/** Статус из строки запроса: наш — фильтр, всё прочее — «все статусы», а не отказ. */
export const readOrderStatusFilter = (value: unknown): OrderStatus | null =>
  OFFICE_ORDER_STATUSES.find((status) => status === value) ?? null;

export type ReadOfficeOrdersRequest = {
  officeId: string | null;
  status: OrderStatus | null;
  limit: number;
  offset: number;
};

export const readOfficeOrders = async (
  worker: OfficeWorker,
  request: ReadOfficeOrdersRequest,
): Promise<OfficeOrdersResponse> => {
  const offices = await readEmployeeOffices(worker);
  const officeId =
    request.officeId ??
    offices.find((office) => !office.archived)?.officeId ??
    offices[0]?.officeId ??
    null;

  if (officeId === null || !offices.some((office) => office.officeId === officeId)) {
    throw new OfficeNotOpenError(officeId ?? '(офисов нет)');
  }

  const limit = Math.min(Math.max(request.limit, 1), MAX_OFFICE_ORDERS_LIMIT);
  const filter = { officeId, status: request.status };

  const [rows, total] = await Promise.all([
    listOfficeOrders({ ...filter, limit, offset: request.offset }),
    countOfficeOrders(filter),
  ]);

  const linesByOrder =
    rows.length === 0
      ? new Map<string, OrderLineRow[]>()
      : groupLinesByOrder(await listOrderLines(rows.map((row) => row.id)));

  return {
    offices,
    officeId,
    orders: rows.map((row) => describeOfficeOrder(row, linesByOrder.get(row.id) ?? [])),
    total,
    limit,
    offset: request.offset,
  };
};
