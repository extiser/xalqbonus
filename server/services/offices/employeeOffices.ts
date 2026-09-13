import type { EmployeeRole } from '#server/generated/prisma/enums';
import { listEmployeeOffices, listOffices, type OfficeRow } from '#server/repositories/offices';
import { OfficeNotOpenError } from '#server/services/offices/errors';
import type { EmployeeOffice } from '#shared/types/orders';
// Относительным путём, а не через `#shared`: значение, а не тип, и модуль читают тесты,
// у которых из псевдонимов настроен один `#server` — как у словаря бота (`server/bot/texts.ts`).
import { ANY_OFFICE_ROLES } from '../../../shared/access';

/**
 * В каких офисах сотрудник выдаёт и отменяет заказы.
 *
 * `owner` и `admin` работают в любом офисе, `manager` — только в тех, к которым привязан через
 * `employee_offices` (issue #122). Роли берутся из `shared/access.ts` — того же списка, по
 * которому разметка решает, что показать, — а решает этот код, одинаково для Mini App и веба.
 *
 * Роль приходит из проверки доступа, то есть из базы на этом же запросе, а не из клиента
 * (docs/principles.md → «Доверие к входным данным»).
 */

export type OfficeWorker = {
  employeeId: string;
  role: EmployeeRole;
};

const toEmployeeOffice = (row: OfficeRow): EmployeeOffice => ({
  officeId: row.id,
  name: row.name,
  address: row.address,
  archived: row.archivedAt !== null,
});

/**
 * Офисы сотрудника: работающие первыми, архивные последними.
 *
 * Пустой список — законный ответ: менеджера завели, а к офису ещё не привязали. Что сказать
 * ему на экране, решает экран; ручки заказов ему отказывают.
 */
export const readEmployeeOffices = async (worker: OfficeWorker): Promise<EmployeeOffice[]> => {
  const rows = ANY_OFFICE_ROLES.includes(worker.role)
    ? await listOffices()
    : await listEmployeeOffices(worker.employeeId);

  return rows.map(toEmployeeOffice);
};

/**
 * Офис, если он открыт сотруднику, — или `OfficeNotOpenError`.
 *
 * Несуществующий офис отвечает так же, как чужой: отличать «нет» от «не ваш» незачем.
 */
export const requireOpenOffice = async (
  worker: OfficeWorker,
  officeId: string,
): Promise<EmployeeOffice> => {
  const office = (await readEmployeeOffices(worker)).find((entry) => entry.officeId === officeId);

  if (!office) {
    throw new OfficeNotOpenError(officeId);
  }

  return office;
};
