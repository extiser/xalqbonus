import { findPendingOfficeOrderByCode, listOrderLines } from '#server/repositories/orders';
import { requireOpenOffice, type OfficeWorker } from '#server/services/offices/employeeOffices';
import { OrderNotFoundError } from '#server/services/orders/errors';
import { describeOfficeOrder } from '#server/services/orders/officeOrderView';
import type { OfficeOrder } from '#shared/types/orders';

/**
 * Заказ по коду, названному водителем у стойки, — среди висящих заказов этого офиса.
 *
 * Сначала проверяется, что офис открыт сотруднику: иначе менеджер перебором офисов узнавал бы,
 * где висит заказ с этим кодом. Дальше код ищется **в офисе**, и чужой офис отвечает тем же
 * «не найден», что и несуществующий код.
 *
 * Строка, не похожая на код, до базы не доходит и получает тот же ответ: «не найден» честен —
 * заказа с таким кодом нет и быть не может.
 */

const ORDER_CODE = /^\d{5}$/;

export const findOfficeOrderByCode = async (
  worker: OfficeWorker,
  officeId: string,
  code: string,
): Promise<OfficeOrder> => {
  await requireOpenOffice(worker, officeId);

  const row = ORDER_CODE.test(code) ? await findPendingOfficeOrderByCode(officeId, code) : null;

  if (!row) {
    throw new OrderNotFoundError(code);
  }

  return describeOfficeOrder(row, await listOrderLines([row.id]));
};
