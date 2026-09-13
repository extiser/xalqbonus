import { findOffice, listOfficeEmployees } from '#server/repositories/offices';
import { toOffice } from '#server/services/offices/fields';
import type { OfficeCardResponse } from '#shared/types/catalog';

/**
 * Страница офиса: сам офис и закреплённые за ним сотрудники.
 *
 * Одним ответом, а не двумя запросами со страницы: список сотрудников — часть карточки
 * офиса, и грузить его отдельным состоянием загрузки незачем. Остатки и журнал движений
 * идут своими ручками — у них своя цена и своё листание.
 *
 * `null` — офиса нет. Решение, что на это ответить, принимает ручка.
 */
export const readOfficeCard = async (officeId: string): Promise<OfficeCardResponse | null> => {
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
    })),
  };
};
