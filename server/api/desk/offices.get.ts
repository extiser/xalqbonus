import { readDeskOffices } from '#server/services/desk/readDeskOffices';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { ORDER_ROLES } from '#shared/access';
import type { DeskOfficesResponse } from '#shared/types/orders';

// Офисы стойки с числом ждущих выдачи — выбор офиса и шторка «Сменить» в Mini App (issue #250).
// Своя ручка, а не `/api/orders`: у веба свой выбор офиса, с архивными и без чисел.
export default defineEventHandler(async (event): Promise<DeskOfficesResponse> => {
  const employee = await requireEmployeeRole(event, ORDER_ROLES, { allowDemo: true });

  return readDeskOffices(employee);
});
