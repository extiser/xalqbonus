import { consola } from 'consola';
import { db } from '#server/db';
import { findEmployeesByIds } from '#server/repositories/employees';
import {
  findOffice,
  listOfficeEmployees,
  replaceOfficeEmployees,
} from '#server/repositories/offices';
import { UnknownOfficeEmployeeError, UnknownOfficeError } from '#server/services/offices/errors';
import type { OfficeEmployeesResponse } from '#shared/types/catalog';

/**
 * Закрепление сотрудников за офисом — набором целиком.
 *
 * Набор, а не два действия «привязать» и «снять»: экран правит один список, и вторая ручка
 * однажды осталась бы незваной. Повторная отправка того же набора ничего не меняет —
 * это то же состояние, а не ошибка.
 *
 * Проверка и запись — в одной транзакции: между «сотрудник существует» и «строка вставлена»
 * иначе уместилось бы удаление учётки, и внешний ключ отказал бы пятисоткой вместо внятного
 * ответа. Повторов в присланном списке не боимся: набор приводится к множеству до записи.
 */
const log = consola.withTag('offices:employees');

export const setOfficeEmployees = async (
  officeId: string,
  employeeIds: string[],
): Promise<OfficeEmployeesResponse> => {
  const unique = [...new Set(employeeIds)];

  const employees = await db.$transaction(async (transaction) => {
    const office = await findOffice(officeId, transaction);

    if (!office) {
      throw new UnknownOfficeError(officeId);
    }

    const known = await findEmployeesByIds(unique, transaction);

    if (known.length !== unique.length) {
      const knownIds = new Set(known.map((employee) => employee.id));

      throw new UnknownOfficeEmployeeError(unique.filter((id) => !knownIds.has(id)));
    }

    await replaceOfficeEmployees(officeId, unique, transaction);

    return listOfficeEmployees(officeId, transaction);
  });

  log.info('состав офиса записан', { officeId, employees: employees.length });

  return {
    employees: employees.map((employee) => ({
      employeeId: employee.employeeId,
      fullName: employee.fullName,
      role: employee.role,
    })),
  };
};
