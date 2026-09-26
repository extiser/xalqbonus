import { listActiveOffices, type OfficeRow } from '#server/repositories/offices';
import type { MemberOffice, MiniAppOfficesResponse } from '#shared/types/miniapp';

/**
 * Офисы, куда водитель может приехать за товаром: только работающие.
 *
 * Состав короче служебного: архивного признака нет, потому что архивных здесь нет вовсе.
 * Признака демо нет тоже: ДЕМО ОФИС живому водителю не отдаётся, а демо-водителю
 * показывается как любой другой (issue #212).
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
  /** Водитель демо: ему видны и живые офисы, и ДЕМО ОФИС. Живому — только живые. */
  isDemo: boolean;
};

export const readMemberOffices = async (
  request: MemberOfficesRequest,
): Promise<MiniAppOfficesResponse> => {
  const rows = await listActiveOffices(request.isDemo);

  return { offices: rows.map(toMemberOffice) };
};
