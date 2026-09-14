import { randomUUID } from 'node:crypto';

import { consola } from 'consola';
import { findDriverAccountByPerson } from '#server/repositories/points';
import {
  DriverAccountMissingError,
  InvalidManualAmountError,
  MissingManualNoteError,
} from '#server/services/points/errors';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import { buildManualIdempotencyKey } from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';

/**
 * Ручная правка баллов: одна операция по одному человеку, заведённая сотрудником
 * по конкретному поводу (docs/points.md → ключ `manual:<uuid>`).
 *
 * Знак суммы задаёт направление: плюс — `emission` → водитель, минус — обратно. Перевод
 * знака не принимает, поэтому знак превращается здесь в пару счетов, а сумма — в модуль.
 *
 * **Ключ выдаётся на запрос, а не приходит от клиента.** Двух одинаковых ручных правок
 * не бывает, и ключ здесь про уникальность операции, а не про повтор формы: двойное нажатие
 * отсекает погашенная на время запроса кнопка. Ключ, присланный клиентом, превратил бы
 * произвольную строку в идентификатор записи журнала.
 *
 * В минус списание не уводит: `accounts_driver_balance_check` в базе отбивает перевод,
 * и ядро поднимает `InsufficientPointsError` — ни записи, ни тронутого баланса.
 */

const log = consola.withTag('points:manual');

/** Путь операции в `point_transfers.actor`: правка заведена сотрудником. */
const ACTOR = 'operator';

export type AdjustPointsManuallyInput = {
  personId: string;
  /** Целое, не ноль. Знак — направление. */
  amount: number;
  /** Зачем правим. Обязательна. */
  note: string;
  employeeId: string;
};

export type AdjustPointsManuallyResult = {
  transferId: string;
  /** Баланс водителя после правки. */
  balance: bigint;
};

export const adjustPointsManually = async (
  input: AdjustPointsManuallyInput,
): Promise<AdjustPointsManuallyResult> => {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new InvalidManualAmountError(input.amount);
  }

  const note = input.note.trim();

  if (note.length === 0) {
    throw new MissingManualNoteError();
  }

  const driverAccount = await findDriverAccountByPerson(input.personId);

  if (!driverAccount) {
    throw new DriverAccountMissingError(input.personId);
  }

  const emissionAccount = await getSystemAccount('emission');
  const incoming = input.amount > 0;

  const { transfer } = await transferPoints({
    reason: 'manual',
    idempotencyKey: buildManualIdempotencyKey(randomUUID()),
    amount: Math.abs(input.amount),
    fromAccountId: incoming ? emissionAccount.id : driverAccount.id,
    toAccountId: incoming ? driverAccount.id : emissionAccount.id,
    occurredAt: new Date(),
    context: { actor: ACTOR, actorEmployeeId: input.employeeId, note },
  });

  // Баланс читается после записи, а не считается от прочитанного до неё: между двумя
  // запросами на счёт успевает приехать поездка, и посчитанное число было бы неверным.
  const updated = await findDriverAccountByPerson(input.personId);

  log.info('баллы поправлены вручную', {
    personId: input.personId,
    amount: input.amount,
    employeeId: input.employeeId,
    transferId: transfer.id,
  });

  return { transferId: transfer.id, balance: updated?.balance ?? driverAccount.balance };
};
