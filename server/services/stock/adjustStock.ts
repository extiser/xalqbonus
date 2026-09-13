import { consola } from 'consola';
import { db } from '#server/db';
import { lockStockRows, writeStockMovement } from '#server/repositories/stock';
import {
  EmptyAdjustmentError,
  MissingAdjustmentNoteError,
  StockWouldGoNegativeError,
  UnknownStockTargetError,
} from '#server/services/stock/errors';
import {
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  isConstraintViolation,
} from '#server/utils/postgresErrors';

/**
 * Правка остатка руками: пересчёт полки, бой, недостача.
 *
 * Автор и заметка обязательны — правка без объяснения через месяц неотличима от ошибки
 * кода, и разбираться с ней будет некому. Оба требования стоят и проверкой
 * `stock_movements_kind_signs_check` в базе.
 *
 * В минус правка не уводит: отказ `office_stock_on_hand_check` переводится в доменную
 * ошибку. Резерв правка не трогает вовсе — он принадлежит висящим заказам, и уменьшить
 * его значит отобрать у водителя товар, который он уже оплатил баллами.
 */

const log = consola.withTag('stock:adjust');

export type AdjustStockInput = {
  officeId: string;
  productId: string;
  /** Насколько изменить свободный остаток. Любого знака, но не ноль. */
  delta: number;
  employeeId: string;
  /** Зачем правим. Обязательна. */
  note: string;
};

export const adjustStock = async (input: AdjustStockInput): Promise<void> => {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new EmptyAdjustmentError();
  }

  if (input.note.trim().length === 0) {
    throw new MissingAdjustmentNoteError();
  }

  try {
    await db.$transaction(async (transaction) => {
      // Строка берётся под блокировку до записи: правка и оформление заказа спорят
      // за один и тот же свободный остаток, и без блокировки «минус три» могло бы уйти
      // в базу одновременно с резервом последней штуки.
      await lockStockRows(transaction, input.officeId, [input.productId]);

      await writeStockMovement(transaction, {
        officeId: input.officeId,
        productId: input.productId,
        kind: 'adjustment',
        deltaOnHand: input.delta,
        deltaReserved: 0,
        employeeId: input.employeeId,
        note: input.note,
      });
    });
  } catch (error) {
    if (isConstraintViolation(error, CHECK_VIOLATION, 'office_stock_on_hand_check')) {
      throw new StockWouldGoNegativeError(input.officeId, input.productId);
    }

    if (isConstraintViolation(error, FOREIGN_KEY_VIOLATION)) {
      throw new UnknownStockTargetError(input.officeId, input.productId);
    }

    throw error;
  }

  log.info('остаток поправлен', {
    officeId: input.officeId,
    productId: input.productId,
    delta: input.delta,
  });
};
