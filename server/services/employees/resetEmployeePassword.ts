import { consola } from 'consola';

import { db } from '#server/db';
import { clearEmployeePassword, findEmployeeById, lockEmployeeById } from '#server/repositories/employees';
import { PASSWORD_LINK_LIFETIME_MS } from '#server/services/employees/config';
import { buildSetPasswordLink } from '#server/services/employees/employeeLinks';
import { issueAccessLinkWithin } from '#server/services/employees/issueAccessLink';
import { canManageEmployee, type EmployeeActor } from '#server/services/employees/roles';

/**
 * Сброс пароля сотруднику: пароль обнуляется, выданные cookie гаснут, выпускается ссылка
 * «задать пароль» (issue #267).
 *
 * Пароль здесь не задаётся и не показывается никому: ручки «поставить пароль другому»
 * не существует и не появляется. Новый пароль сотрудник придумывает сам на странице
 * `/set-password/<токен>` — ссылку сбросивший пересылает ему так же, как приглашение. Знание
 * пароля остаётся у одного человека, иначе журнал перестаёт отвечать, кто именно выдал заказ
 * (docs/decisions.md → «Пароль сотрудника: задаёт сам, сбрасывает владелец»).
 *
 * Право — «роль строго ниже своей» (`roles.ts`). Себе сбросить нельзя тем же правилом:
 * свой пароль меняется на `/password`.
 *
 * Повторный сброс у того, у кого пароля уже нет, сессии не гасит второй раз, а ссылку
 * выпускает новую, отзывая прежнюю: так «Сбросить пароль» чинит истёкшую ссылку.
 */

const log = consola.withTag('employees:password');

export type ResetEmployeePasswordOutcome =
  | 'reset'
  /** Учётки с таким идентификатором нет. */
  | 'not_found'
  /** Роль учётки не ниже роли действующего. */
  | 'forbidden'
  /**
   * Демо-учётка (issue #205): своего входа у неё нет, и ссылка «задать пароль» открыла бы в неё
   * дверь из веба. База такой пароль и не примет (`employees_demo_no_login_check`), но
   * отбивается здесь, до выпуска ссылки.
   */
  | 'demo_account';

export type ResetEmployeePasswordRequest = {
  actor: EmployeeActor;
  employeeId: string;
  /** Схема и хост приложения — из запроса: ссылка ведёт туда же. */
  appOrigin: string;
  now?: Date;
};

// Каждый отказ отдельным членом объединения: объединённый литерал перестаёт быть различителем,
// и проверка `outcome === ...` у ручки тип больше не сужает (как в `loginByPassword.ts`).
export type ResetEmployeePasswordResult =
  | { outcome: 'reset'; link: string; expiresAt: Date }
  | { outcome: 'not_found' }
  | { outcome: 'forbidden' }
  | { outcome: 'demo_account' };

export const resetEmployeePassword = async (
  request: ResetEmployeePasswordRequest,
): Promise<ResetEmployeePasswordResult> => {
  const employee = await findEmployeeById(request.employeeId);

  if (!employee) {
    return { outcome: 'not_found' };
  }

  if (!canManageEmployee(request.actor.role, employee.role)) {
    return { outcome: 'forbidden' };
  }

  if (employee.isDemo) {
    return { outcome: 'demo_account' };
  }

  const now = request.now ?? new Date();

  const result = await db.$transaction(async (transaction) => {
    // Строка учётки под блокировкой: две одновременные кнопки выпускают ссылки по очереди,
    // и вторая отзывает первую, а не упирается в индекс открытых ссылок.
    await lockEmployeeById(employee.id, transaction);

    // Условие «пароль есть» стоит в самом `UPDATE`: без пароля строка не трогается, и отметка
    // годности сессий не двигается от нажатия, которое ничего не сбросило.
    const cleared = await clearEmployeePassword(employee.id, now, transaction);
    const link = await issueAccessLinkWithin(transaction, {
      employeeId: employee.id,
      kind: 'password',
      issuedById: request.actor.employeeId,
      lifetimeMs: PASSWORD_LINK_LIFETIME_MS,
      now,
    });

    return { cleared, link };
  });

  log.info(result.cleared ? 'пароль сброшен, ссылка выпущена' : 'ссылка для пароля выпущена заново', {
    employeeId: employee.id,
    actorEmployeeId: request.actor.employeeId,
  });

  return {
    outcome: 'reset',
    link: buildSetPasswordLink(request.appOrigin, result.link.token),
    expiresAt: result.link.expiresAt,
  };
};
