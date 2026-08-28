import type { PointReason } from '#server/generated/prisma/enums';
import { writeTransfer, type TransferContext, type TransferRow } from '#server/repositories/points';
import {
  IdempotencyKeyConflictError,
  InsufficientPointsError,
  InvalidTransferAmountError,
  SameAccountTransferError,
  UnknownAccountError,
} from '#server/services/points/errors';
import type { IdempotencyKey } from '#server/services/points/idempotencyKey';
import {
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  isConstraintViolation,
} from '#server/services/points/postgresErrors';

/**
 * Примитив перевода — единственная точка записи в журнал баллов.
 *
 * Прямое изменение `accounts.balance` запрещено везде, кроме этого пути
 * (docs/points.md → «Баланс — производная, а не значение»). Всё остальное — начисление
 * за поездку, списание при заказе, возврат, сгорание, объединение двойников — строится
 * поверх него и отличается только причиной, ключом и парой счетов.
 */

export type TransferPointsInput = {
  reason: PointReason;
  /** Собирается построителем из `idempotencyKey.ts`: произвольную строку сюда не передать. */
  idempotencyKey: IdempotencyKey;
  /** Целое положительное. Направление задаётся парой счетов, а не знаком суммы. */
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  /** Время самой операции, а не время записи: у начисления за поездку это её завершение. */
  occurredAt: Date;
  context?: TransferContext;
};

export type TransferPointsResult = {
  transfer: TransferRow;
  /**
   * `false` — перевод по этому ключу уже был записан, повторный вызов не тронул
   * ни одного баланса. Это штатный исход, а не ошибка: ретраи и перекрытие окон опроса
   * приводят сюда постоянно.
   */
  applied: boolean;
};

// Ключ занят другой операцией — это не «повтор», а совпадение ключей у разных операций.
// Молча вернуть прежний перевод нельзя: вызывающий счёл бы выполненной операцию,
// которой не было. Время операции сюда не входит намеренно: у одной и той же поездки
// оно может уточниться на стороне Fleet API, и это не делает начисление другим.
const describeDifference = (existing: TransferRow, input: TransferPointsInput): string | null => {
  const differences: string[] = [];

  if (existing.reason !== input.reason) {
    differences.push(`причина ${existing.reason} вместо ${input.reason}`);
  }

  if (existing.amount !== BigInt(input.amount)) {
    differences.push(`сумма ${existing.amount} вместо ${input.amount}`);
  }

  if (existing.fromAccountId !== input.fromAccountId) {
    differences.push(`счёт-источник ${existing.fromAccountId} вместо ${input.fromAccountId}`);
  }

  if (existing.toAccountId !== input.toAccountId) {
    differences.push(`счёт-получатель ${existing.toAccountId} вместо ${input.toAccountId}`);
  }

  return differences.length > 0 ? differences.join(', ') : null;
};

export const transferPoints = async (
  input: TransferPointsInput,
): Promise<TransferPointsResult> => {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new InvalidTransferAmountError(input.amount);
  }

  if (input.fromAccountId === input.toAccountId) {
    throw new SameAccountTransferError(input.fromAccountId);
  }

  let result: TransferPointsResult;

  try {
    result = await writeTransfer({
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      amount: BigInt(input.amount),
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      occurredAt: input.occurredAt,
      context: input.context ?? {},
    });
  } catch (error) {
    if (isConstraintViolation(error, CHECK_VIOLATION, 'accounts_driver_balance_check')) {
      throw new InsufficientPointsError(input.fromAccountId, BigInt(input.amount));
    }

    if (isConstraintViolation(error, FOREIGN_KEY_VIOLATION)) {
      throw new UnknownAccountError(
        `перевод между ${input.fromAccountId} и ${input.toAccountId}`,
      );
    }

    throw error;
  }

  const difference = describeDifference(result.transfer, input);

  if (difference) {
    throw new IdempotencyKeyConflictError(input.idempotencyKey, difference);
  }

  return result;
};
