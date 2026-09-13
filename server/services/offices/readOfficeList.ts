import { listOffices } from '#server/repositories/offices';
import { toOffice } from '#server/services/offices/fields';
import type { OfficeListResponse } from '#shared/types/catalog';

/**
 * Список офисов для экрана «Офисы» — вместе с архивными.
 *
 * Архив не прячется, а помечается: «офиса нет в списке» не должно означать «офис закрыт»,
 * иначе закрытый офис ищут заведением второго с тем же названием.
 */
export const readOfficeList = async (): Promise<OfficeListResponse> => {
  const rows = await listOffices();

  return { offices: rows.map(toOffice) };
};
