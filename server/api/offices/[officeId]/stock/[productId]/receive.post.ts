import {
  InvalidReceiveQuantityError,
  UnknownStockTargetError,
} from '#server/services/stock/errors';
import { receiveStock } from '#server/services/stock/receiveStock';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { StockOperationResponse } from '#shared/types/catalog';

// Приход товара в офис. Пишет сервис остатков — движение и кэш одной транзакцией; прямой
// `UPDATE office_stock` из ручки запрещён так же, как прямое изменение баланса.
//
// Автор прихода — вошедший сотрудник, и берётся он из сессии, а не из тела запроса: то,
// что прислал клиент, основанием для авторства не является (docs/principles.md → «Доверие
// к входным данным»).
type ReceiveBody = {
  quantity?: unknown;
  note?: unknown;
};

export default defineEventHandler(async (event): Promise<StockOperationResponse> => {
  const employee = await requireEmployeeRole(event, CATALOG_ROLES);

  const officeId = requireUuidParam(event, 'officeId');
  const productId = requireUuidParam(event, 'productId');

  await requireDemoEditor(employee, { kind: 'office', id: officeId });

  const body = await readBody<ReceiveBody>(event);

  const quantity = typeof body?.quantity === 'number' ? body.quantity : Number(body?.quantity);

  if (!Number.isFinite(quantity)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'нужно количество прихода',
    });
  }

  try {
    // Остаток после операции — тем же ответом: его читает сервис в своей транзакции, и второго
    // запроса за ним отсюда не идёт. Ручка в репозиторий не ходит вовсе
    // (docs/principles.md → «Слои и зависимости»).
    const stock = await receiveStock({
      officeId,
      productId,
      quantity,
      employeeId: employee.employeeId,
      note: typeof body?.note === 'string' && body.note.trim() !== '' ? body.note.trim() : null,
    });

    return { productId, onHand: stock.onHand, reserved: stock.reserved };
  } catch (error) {
    if (error instanceof InvalidReceiveQuantityError) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: 'приход должен быть целым положительным числом',
      });
    }

    if (error instanceof UnknownStockTargetError) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: 'офиса или товара с такими идентификаторами нет',
      });
    }

    throw error;
  }
});
