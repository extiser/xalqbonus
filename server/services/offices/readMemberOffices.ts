import { listActiveOffices, type OfficeRow } from '#server/repositories/offices';
import type { MemberOffice, MiniAppOfficesResponse } from '#shared/types/miniapp';

/**
 * Офисы, куда водитель может приехать за товаром: только работающие.
 *
 * Состав короче служебного: архивного признака нет, потому что архивных здесь нет вовсе.
 * Признака демо нет тоже: офисы разведены по сторонам (issue #212) — живому водителю только
 * живые, демо-водителю только ДЕМО ОФИС, и помечать в списке нечего.
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

export type MemberOfficesRequest = {
  /** Водитель демо: ему видны только демо-офисы. Живому — только живые. */
  isDemo: boolean;
};

export const readMemberOffices = async (
  request: MemberOfficesRequest,
): Promise<MiniAppOfficesResponse> => {
  const rows = await listActiveOffices(request.isDemo);

  return { offices: rows.map(toMemberOffice) };
};
