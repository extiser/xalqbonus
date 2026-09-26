import { deskDriverName } from '#server/repositories/deskDriver';
import {
  findOfficeOrder,
  listOrderLines,
  type OfficeOrderRow,
  type OrderLineRow,
} from '#server/repositories/orders';
import type { OfficeOrder } from '#shared/types/orders';

/**
 * Во что превращается заказ на экране сотрудника.
 *
 * Решений здесь нет — только перевод строки заказа в контракт. Отдельным модулем, как
 * `memberOrderScreen.ts` у водителя: вызывающих четыре — список, поиск по коду, выдача
 * и отмена.
 */

export const describeOfficeOrder = (row: OfficeOrderRow, lines: OrderLineRow[]): OfficeOrder => ({
  orderId: row.id,
  number: row.number,
  status: row.status,
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
    photoPath: line.photoPath,
    photoUpdatedAt: line.photoUpdatedAt.toISOString(),
  })),
  totalPoints: row.totalPoints,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
  issuedAt: row.issuedAt?.toISOString() ?? null,
  cancelledAt: row.cancelledAt?.toISOString() ?? null,
  cancelReason: row.cancelReason,
});

/** Один заказ целиком, с позициями. `null` — такого заказа нет. */
export const readOfficeOrder = async (orderId: string): Promise<OfficeOrder | null> => {
  const row = await findOfficeOrder(orderId);

  if (!row) {
    return null;
  }

  return describeOfficeOrder(row, await listOrderLines([row.id]));
};
