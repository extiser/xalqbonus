import { consola } from 'consola';

import { revokeEmployeeSessions } from '#server/repositories/employees';

/**
 * Выход сотрудника из веба.
 *
 * Гасит сессию на сервере, а не только в браузере. Одного удаления cookie не хватило бы:
 * значение подписано и годно тридцать суток, и сохранённое до выхода продолжало бы пускать —
 * кнопка «Выйти» означала бы «убрал с глаз», а не «вышел» (issue #102).
 *
 * Гасятся все выданные cookie сразу, а не один: различить устройства нечем — таблицы сессий
 * нет и не будет (docs/decisions.md → «Сессия веба живёт в подписанном cookie»).
 *
 * Отметка та же, что двигает смена пароля: два события гасят сессии, а поле, по которому
 * проверяется годность, одно.
 */

const log = consola.withTag('employees:auth');

export type SignOutRequest = {
  employeeId: string;
  now?: Date;
};

export const signOut = async (request: SignOutRequest): Promise<void> => {
  await revokeEmployeeSessions(request.employeeId, request.now ?? new Date());

  log.info('выход из веба', { employeeId: request.employeeId });
};
