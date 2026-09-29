import { listOfficeCandidates } from '#server/repositories/employees';
import { findOffice } from '#server/repositories/offices';
import type { OfficeEmployeeCandidatesResponse } from '#shared/types/catalog';

/**
 * Кого предложить в «Добавить сотрудника» на странице офиса (issue #291).
 *
 * Своя ручка, а не список экрана сотрудников: страница офиса открыта `CATALOG_ROLES`, куда
 * входит старший менеджер, а экран сотрудников — `STAFF_ROLES`, и с ним приезжают телефоны,
 * ссылки паролей и права над учётками. Закреплению нужны имя и роль.
 *
 * Сторона решается здесь по офису: демо-офису — демо-сотрудники, живому — живые (issue #252).
 * Закрытые учётки не предлагаются (issue #257). Уже закреплённых отсекает страница: состав
 * меняется чаще, чем этот список перечитывается.
 *
 * `null` — офиса нет.
 */
export const readOfficeCandidates = async (
  officeId: string,
): Promise<OfficeEmployeeCandidatesResponse | null> => {
  const office = await findOffice(officeId);

  if (!office) {
    return null;
  }

  const rows = await listOfficeCandidates(office.isDemo);

  return {
    candidates: rows.map((row) => ({ employeeId: row.id, fullName: row.fullName, role: row.role })),
  };
};
