import { findOffice, listOfficeEmployees } from '#server/repositories/offices';
import { outranks, type EmployeeActor } from '#server/services/employees/roles';
import { toOffice } from '#server/services/offices/fields';
import type { OfficeCardResponse } from '#shared/types/catalog';

/**
 * Страница офиса: сам офис и закреплённые за ним сотрудники.
 *
 * Одним ответом, а не двумя запросами со страницы: список сотрудников — часть карточки
 * офиса, и грузить его отдельным состоянием загрузки незачем. Остатки и журнал движений
 * идут своими ручками — у них своя цена и своё листание.
 *
 * `removable` у закреплённого решён здесь по смотрящему — «строго ниже своей» (issue #291):
 * снять равного или старшего ручка закрепления откажет, и кнопки у такого нет.
 *
 * `null` — офиса нет. Решение, что на это ответить, принимает ручка.
 */
export const readOfficeCard = async (
  officeId: string,
  actor: EmployeeActor,
): Promise<OfficeCardResponse | null> => {
  const office = await findOffice(officeId);

  if (!office) {
    return null;
  }

  const employees = await listOfficeEmployees(officeId);

  return {
    office: toOffice(office),
    employees: employees.map((employee) => ({
      employeeId: employee.employeeId,
      fullName: employee.fullName,
      role: employee.role,
      removable: outranks(actor.role, employee.role),
    })),
  };
};
