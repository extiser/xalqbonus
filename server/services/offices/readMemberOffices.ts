import { listActiveOffices, type OfficeRow } from '#server/repositories/offices';
import type { MemberOffice, MiniAppOfficesResponse } from '#shared/types/miniapp';

/**
 * Офисы, куда водитель может приехать за товаром: только работающие.
 *
 * Состав короче служебного: архивного признака нет, потому что архивных здесь нет вовсе.
 */

export const toMemberOffice = (row: OfficeRow): MemberOffice => ({
  officeId: row.id,
  name: row.name,
  address: row.address,
  workHours: row.workHours,
  phone: row.phoneE164,
  telegram: row.telegram,
  mapUrl: row.mapUrl,
});

export const readMemberOffices = async (): Promise<MiniAppOfficesResponse> => {
  const rows = await listActiveOffices();

  return { offices: rows.map(toMemberOffice) };
};
