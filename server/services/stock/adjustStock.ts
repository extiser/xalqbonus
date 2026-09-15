import { consola } from 'consola';
import { db } from '#server/db';
import {
  findStockRow,
  lockStockRows,
  writeStockMovement,
  type StockRow,
} from '#server/repositories/stock';
import {
  EmptyAdjustmentError,
  InvalidStockTargetError,
  MissingAdjustmentNoteError,
  StockWouldGoNegativeError,
  UnknownStockTargetError,
} from '#server/services/stock/errors';
import { assertStockProduct } from '#server/services/stock/stockProduct';
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
 *
 * **Сказать, насколько изменить, можно двумя способами, и оба — одна операция.** Ядро заказа
 * и тесты говорят дельтой: они знают, сколько прибавить. Человек за формой говорит новым
 * значением: он пересчитал полку и видит на ней шесть штук, а не «минус три». Дельту в этом
 * случае считает сервис — здесь, внутри той же транзакции, после блокировки строки.
 * Посчитанная в браузере дельта опиралась бы на остаток, показанный секунду назад, и заказ,
 * оформленный в этот промежуток, она бы затёрла.
 *
 * Остаток после правки возвращается прочитанным в той же транзакции — по той же причине,
 * по которой в ней же считается дельта.
 */

const log = consola.withTag('stock:adjust');

type AdjustStockTarget =
  /** Насколько изменить свободный остаток. Любого знака, но не ноль. */
  | { delta: number }
  /** Каким свободный остаток должен стать. Целое неотрицательное. */
  | { targetOnHand: number };

export type AdjustStockInput = {
  officeId: string;
  productId: string;
  employeeId: string;
  /** Зачем правим. Обязательна. */
  note: string;
} & AdjustStockTarget;

export const adjustStock = async (input: AdjustStockInput): Promise<StockRow> => {
  if (input.note.trim().length === 0) {
    throw new MissingAdjustmentNoteError();
  }

  if ('delta' in input && (!Number.isInteger(input.delta) || input.delta === 0)) {
    throw new EmptyAdjustmentError();
  }

  if ('targetOnHand' in input) {
    if (!Number.isInteger(input.targetOnHand) || input.targetOnHand < 0) {
      throw new InvalidStockTargetError(input.targetOnHand);
    }
  }

  await assertStockProduct(input.officeId, input.productId);

  let appliedDelta = 0;
  let stock: StockRow;

  try {
    stock = await db.$transaction(async (transaction) => {
      // Строка берётся под блокировку до записи: правка и оформление заказа спорят
      // за один и тот же свободный остаток, и без блокировки «минус три» могло бы уйти
      // в базу одновременно с резервом последней штуки. Тем же чтением берётся остаток,
      // от которого считается дельта при правке новым значением, — считать его раньше
      // блокировки значило бы считать от числа, которое уже могло измениться.
      const [current] = await lockStockRows(transaction, input.officeId, [input.productId]);

      // Строки нет — движений по паре не было ни одного, и свободный остаток равен нулю.
      const onHand = current?.onHand ?? 0;

      appliedDelta = 'delta' in input ? input.delta : input.targetOnHand - onHand;

      // Ноль остаётся отказом и здесь: правка, ничего не меняющая, — это запись в журнал,
      // которая ни на один вопрос не отвечает. У правки новым значением это штатный случай
      // — сотрудник пересчитал полку и нашёл там то же самое, — и ответ ему нужен внятный,
      // а не пустое «готово».
      if (appliedDelta === 0) {
        throw new EmptyAdjustmentError();
      }

      await writeStockMovement(transaction, {
        officeId: input.officeId,
        productId: input.productId,
        kind: 'adjustment',
        deltaOnHand: appliedDelta,
        deltaReserved: 0,
        employeeId: input.employeeId,
        note: input.note,
      });

      const row = await findStockRow(input.officeId, input.productId, transaction);

      // Строка есть заведомо: её либо взяла блокировка выше, либо только что завело движение.
      if (!row) {
        throw new Error(
          `остаток товара ${input.productId} в офисе ${input.officeId} не появился после правки`,
        );
      }

      return row;
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
    delta: appliedDelta,
  });

  return stock;
};
