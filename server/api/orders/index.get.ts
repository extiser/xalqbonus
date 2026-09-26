import {
  DEFAULT_OFFICE_ORDERS_LIMIT,
  readOfficeOrders,
  readOrderStatusFilter,
} from '#server/services/orders/readOfficeOrders';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { explainOfficeOrderFailure } from '#server/utils/officeOrderFailure';
import { readPositiveInteger, readUuid } from '#server/utils/query';
import { ORDER_ROLES } from '#shared/access';
import type { OfficeOrdersResponse } from '#shared/types/orders';

// Заказы офиса: `?officeId=&status=&limit=&offset=`. Одна ручка на обе двери — под cookie веба
// и под `initData` Mini App (docs/decisions.md → «Доступ определяется ролью, а не дверью»).
export default defineEventHandler(async (event): Promise<OfficeOrdersResponse> => {
  // Стойка открыта и демо-менеджеру (issue #205): ручку зовёт экран сотрудника в Mini App,
  // а офисы сотрудника ограничивают демо-учётку ДЕМО ОФИСОМ.
  const employee = await requireEmployeeRole(event, ORDER_ROLES, { allowDemo: true });
  const query = getQuery(event);

  try {
    return await readOfficeOrders(employee, {
      officeId: readUuid(query.officeId),
      status: readOrderStatusFilter(query.status),
      limit: readPositiveInteger(query.limit, DEFAULT_OFFICE_ORDERS_LIMIT),
      offset: readPositiveInteger(query.offset, 0),
    });
  } catch (error) {
    throw explainOfficeOrderFailure(error) ?? error;
  }
});
