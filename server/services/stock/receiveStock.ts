import { consola } from 'consola';
import { db } from '#server/db';
import { writeStockMovement } from '#server/repositories/stock';
import {
  InvalidReceiveQuantityError,
  UnknownStockTargetError,
} from '#server/services/stock/errors';
import { FOREIGN_KEY_VIOLATION, isConstraintViolation } from '#server/utils/postgresErrors';

/**
 * Приход товара в офис.
 *
 * Центрального склада нет: товар оформляется сразу в офис. В старой базе остаток жил
 * в двух местах с журналом передачи между ними, и центральный склад после раздачи всегда
 * был нулём, зато в журнале передач лежит запись на 300 000 штук при приходе в 776
 * за всю историю (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт
 * по офисам»).
 *
 * Движение и правка кэша — одной транзакцией, как у любой операции с остатком. Прямой
 * `UPDATE office_stock` запрещён так же, как прямое изменение баланса.
 */

const log = consola.withTag('stock:receive');

export type ReceiveStockInput = {
  officeId: string;
  productId: string;
  /** Сколько пришло. Целое положительное: приход на ноль — не операция. */
  quantity: number;
  /** Сотрудник, оформивший приход. Обязателен: товар в офис кладёт человек. */
  employeeId: string;
  note?: string | null;
};

export const receiveStock = async (input: ReceiveStockInput): Promise<void> => {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new InvalidReceiveQuantityError(input.quantity);
  }

  try {
    await db.$transaction(async (transaction) => {
      await writeStockMovement(transaction, {
        officeId: input.officeId,
        productId: input.productId,
        kind: 'incoming',
        deltaOnHand: input.quantity,
        deltaReserved: 0,
        employeeId: input.employeeId,
        note: input.note ?? null,
      });
    });
  } catch (error) {
    if (isConstraintViolation(error, FOREIGN_KEY_VIOLATION)) {
      throw new UnknownStockTargetError(input.officeId, input.productId);
    }

    throw error;
  }

  log.info('приход оформлен', {
    officeId: input.officeId,
    productId: input.productId,
    quantity: input.quantity,
  });
};
