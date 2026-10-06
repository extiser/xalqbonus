import { consola } from 'consola';

import { db } from '#server/db';
import { lockEmployeeById, updateEmployeeDisabled } from '#server/repositories/employees';
import { detachEmployeeFromOffices, type DetachedOfficeRow } from '#server/repositories/offices';
import { canManageEmployee, type EmployeeActor } from '#server/services/employees/roles';

/**
 * Выключение и включение учётки сотрудника — одна операция с двумя направлениями,
 * как архив офиса: всё, кроме направления, у них общее.
 *
 * Право — «роль строго ниже своей», то же, что у приглашения (`roles.ts`). Отдельных
 * проверок «себя нельзя» и «владельца нельзя» нет: обе следуют из рангов.
 *
 * Сессии здесь не гасятся: `disabled_at` проверяется на каждом запросе в обеих дверях
 * и выбрасывает человека немедленно (`authenticate.ts`). Сдвиг `sessions_valid_from`
 * был бы второй вещью, делающей то же самое, — и заодно ломал бы включение: включённый
 * человек выходил бы из веба, хотя его никто об этом не просил.
 *
 * Выключение снимает учётку со всех офисов той же транзакцией
 * (issue #291): закрытый сотрудник за офисом — строка, которая ничего не значит, а в составе
 * офиса она путала, кто в нём работает. Включение закреплений не возвращает — закрепляют
 * заново на странице офиса. Выдачи, отмены и правки баллов выключенного остаются с его
 * подписью: они ссылаются на учётку, а не на закрепление.
 */

const log = consola.withTag('employees:disable');

export type SetEmployeeDisabledOutcome =
  | 'updated'
  /** Учётки с таким идентификатором нет. */
  | 'not_found'
  /** Роль учётки не ниже роли действующего. */
  | 'forbidden';

export type SetEmployeeDisabledRequest = {
  actor: EmployeeActor;
  employeeId: string;
  disabled: boolean;
  now?: Date;
};

export const setEmployeeDisabled = async (
  request: SetEmployeeDisabledRequest,
): Promise<SetEmployeeDisabledOutcome> => {
  const result = await db.$transaction(async (transaction) => {
    // Под блокировкой строки: выключение и закрепление за офисом не должны разойтись
    // так, что закрепление ляжет после снятия. Вторая сторона — закрепление читает ту же
    // строку `FOR SHARE` (`shareLockEmployeesByIds`, `shareLockDemoEmployee`) и ждёт этой
    // транзакции, а после неё видит учётку уже выключенной.
    const employee = await lockEmployeeById(request.employeeId, transaction);

    if (!employee) {
      return { outcome: 'not_found' as const };
    }

    if (!canManageEmployee(request.actor.role, employee.role)) {
      return { outcome: 'forbidden' as const };
    }

    await updateEmployeeDisabled(
      employee.id,
      request.disabled ? (request.now ?? new Date()) : null,
      transaction,
    );

    const detached: DetachedOfficeRow[] = request.disabled
      ? await detachEmployeeFromOffices(employee.id, transaction)
      : [];

    return { outcome: 'updated' as const, employeeId: employee.id, detached };
  });

  if (result.outcome !== 'updated') {
    return result.outcome;
  }

  if (request.disabled) {
    log.info('учётка выключена', {
      employeeId: result.employeeId,
      actorEmployeeId: request.actor.employeeId,
      detachedOffices: result.detached,
    });
  } else {
    log.info('учётка включена', {
      employeeId: result.employeeId,
      actorEmployeeId: request.actor.employeeId,
    });
  }

  return 'updated';
};
