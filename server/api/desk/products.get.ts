import { readDeskProducts } from '#server/services/desk/readDeskProducts';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { explainOfficeOrderFailure } from '#server/utils/officeOrderFailure';
import { readUuid } from '#server/utils/query';
import { ORDER_ROLES } from '#shared/access';
import type { DeskProductsResponse } from '#shared/types/orders';

// Товары офиса для оформления заказа у стойки: `?officeId=` (issue #294). Своя ручка, а не
// остатки офиса: те открыты только каталогу, а оформляет любая роль — в офисах, открытых ей
// правилом офисов.
export default defineEventHandler(async (event): Promise<DeskProductsResponse> => {
  const employee = await requireEmployeeRole(event, ORDER_ROLES, { allowDemo: true });
  const officeId = readUuid(getQuery(event).officeId);

  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'нужен officeId' });
  }

  try {
    return await readDeskProducts(employee, officeId);
  } catch (error) {
    throw explainOfficeOrderFailure(error) ?? error;
  }
});
