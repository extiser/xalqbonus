import { deskDriverName } from '#server/repositories/deskDriver';
import {
  findOfficeOrder,
  listOrderLines,
  type OfficeOrderRow,
  type OrderLineRow,
} from '#server/repositories/orders';
import type { EmployeeRole } from '#server/generated/prisma/enums';
import type { OfficeOrder, OrderEmployee } from '#shared/types/orders';

/**
 * Во что превращается заказ на экране сотрудника.
 *
 * Решений здесь нет — только перевод строки заказа в контракт. Отдельным модулем, как
 * `memberOrderScreen.ts` у водителя: вызывающих четыре — список, поиск по коду, выдача
 * и отмена.
 */

/** Сотрудник из пары колонок. Пусто — сотрудника у этого шага не было. */
const orderEmployee = (name: string | null, role: EmployeeRole | null): OrderEmployee | null =>
  name !== null && role !== null ? { name, role } : null;

export const describeOfficeOrder = (row: OfficeOrderRow, lines: OrderLineRow[]): OfficeOrder => ({
  orderId: row.id,
  number: row.number,
  status: row.status,
  payment: row.payment,
  channel: row.channel,
  // Код выданного и отменённого освобождён частичным индексом и может уже принадлежать
  // чужому висящему заказу — показывать его незачем.
  code: row.status === 'pending' ? row.code : null,
  officeId: row.officeId,
  officeName: row.officeName,
  driverName: deskDriverName(row),
  callsign: row.callsign,
  phone: row.phone,
  lines: lines.map((line) => ({
    productId: line.productId,
    name: line.name,
    quantity: line.quantity,
    unitPoints: line.unitPoints,
    unitRetail: line.unitRetail,
    photoPath: line.photoPath,
    photoUpdatedAt: line.photoUpdatedAt.toISOString(),
  })),
  totalPoints: row.totalPoints,
  totalRetail: row.totalRetail,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt?.toISOString() ?? null,
  issuedAt: row.issuedAt?.toISOString() ?? null,
  cancelledAt: row.cancelledAt?.toISOString() ?? null,
  cancelReason: row.cancelReason,
  createdBy: orderEmployee(row.createdByName, row.createdByRole),
  issuedBy: orderEmployee(row.issuedByName, row.issuedByRole),
  cancelledBy: orderEmployee(row.cancelledByName, row.cancelledByRole),
});

/** Один заказ целиком, с позициями. `null` — такого заказа нет. */
export const readOfficeOrder = async (orderId: string): Promise<OfficeOrder | null> => {
  const row = await findOfficeOrder(orderId);

  if (!row) {
    return null;
  }

  return describeOfficeOrder(row, await listOrderLines([row.id]));
};
