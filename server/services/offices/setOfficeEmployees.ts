import { consola } from 'consola';
import { db } from '#server/db';
import { shareLockEmployeesByIds } from '#server/repositories/employees';
import {
  listOfficeEmployees,
  replaceOfficeEmployees,
  shareLockOffice,
} from '#server/repositories/offices';
import { outranks, type EmployeeActor } from '#server/services/employees/roles';
import {
  OfficeArchivedError,
  OfficeEmployeeDisabledError,
  OfficeEmployeeRankError,
  OfficeSideMismatchError,
  UnknownOfficeEmployeeError,
  UnknownOfficeError,
} from '#server/services/offices/errors';
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
 *
 * Сторона демо проверяется там же (issue #252): демо-сотрудник — только за демо-офисом,
 * живой — только за живым (`OfficeSideMismatchError`).
 *
 * Закрытая учётная запись в состав не входит (issue #257, `OfficeEmployeeDisabledError`):
 * выключение само снимает учётку со всех офисов (issue #291), и вернуть её туда можно только
 * после включения.
 *
 * Добавить и снять можно только сотрудника строго ниже действующего (issue #291,
 * `OfficeEmployeeRankError`): старший менеджер ставит в офисы менеджеров, но не админа
 * и не владельца. Сравнивается присланный набор с нынешним, а не весь набор: закреплённый
 * админ, оставшийся в наборе как был, сохранению не мешает — иначе старший менеджер
 * не смог бы добавить менеджера в офис, где уже стоит админ.
 *
 * За архивным офисом закрепить нельзя (issue #303, `OfficeArchivedError`): архивация снимает
 * закреплённых, и без запрета снятие жило бы до первого сохранения состава. Пустой набор
 * архивному офису законен — он сохраняет то же пустое состояние. Строка офиса читается
 * под разделяемой блокировкой (`shareLockOffice`): закрепление ждёт идущую архивацию
 * и после неё видит офис архивным, а не ложится поверх снятия.
 */
const log = consola.withTag('offices:employees');

export const setOfficeEmployees = async (
  officeId: string,
  employeeIds: string[],
  actor: EmployeeActor,
): Promise<OfficeEmployeesResponse> => {
  const unique = [...new Set(employeeIds)];

  const employees = await db.$transaction(async (transaction) => {
    const office = await shareLockOffice(officeId, transaction);

    if (!office) {
      throw new UnknownOfficeError(officeId);
    }

    if (office.archivedAt !== null && unique.length > 0) {
      throw new OfficeArchivedError([officeId]);
    }

    // Под разделяемой блокировкой весь присланный набор, а не только добавляемые: чтобы
    // узнать, кто добавляется, набор всё равно читается целиком, а блокировка оставшегося
    // лишь задержит его выключение до конца этой транзакции.
    const known = await shareLockEmployeesByIds(unique, transaction);

    if (known.length !== unique.length) {
      const knownIds = new Set(known.map((employee) => employee.id));

      throw new UnknownOfficeEmployeeError(unique.filter((id) => !knownIds.has(id)));
    }

    const otherSide = known.filter((employee) => employee.isDemo !== office.isDemo);

    if (otherSide.length > 0) {
      throw new OfficeSideMismatchError(
        [officeId],
        otherSide.map((employee) => employee.id),
      );
    }

    const attached = await listOfficeEmployees(officeId, transaction);
    const attachedIds = new Set(attached.map((employee) => employee.employeeId));
    const uniqueIds = new Set(unique);
    const added = known.filter((employee) => !attachedIds.has(employee.id));
    const removed = attached.filter((employee) => !uniqueIds.has(employee.employeeId));
    const outOfRank = [
      ...added.filter((employee) => !outranks(actor.role, employee.role)).map((employee) => employee.id),
      ...removed
        .filter((employee) => !outranks(actor.role, employee.role))
        .map((employee) => employee.employeeId),
    ];

    if (outOfRank.length > 0) {
      throw new OfficeEmployeeRankError(outOfRank);
    }

    const disabled = known.filter((employee) => employee.disabledAt !== null);

    if (disabled.length > 0) {
      throw new OfficeEmployeeDisabledError(disabled.map((employee) => employee.id));
    }

    await replaceOfficeEmployees(officeId, unique, transaction);

    return listOfficeEmployees(officeId, transaction);
  });

  log.info('состав офиса записан', {
    officeId,
    employees: employees.length,
    actorEmployeeId: actor.employeeId,
  });

  return {
    employees: employees.map((employee) => ({
      employeeId: employee.employeeId,
      fullName: employee.fullName,
      role: employee.role,
      removable: outranks(actor.role, employee.role),
    })),
  };
};
