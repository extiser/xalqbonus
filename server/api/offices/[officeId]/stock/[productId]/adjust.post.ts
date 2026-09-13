import { adjustStock } from '#server/services/stock/adjustStock';
import {
  EmptyAdjustmentError,
  InvalidStockTargetError,
  MissingAdjustmentNoteError,
  UnknownStockTargetError,
} from '#server/services/stock/errors';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { StockOperationResponse } from '#shared/types/catalog';

// Правка остатка руками: пересчёт полки, бой, недостача.
//
// Приезжает **новое значение**, а не дельта: сотрудник видит на полке шесть штук, а не
// «минус три». Дельту считает сервис, под той же блокировкой, в которой пишет движение, —
// посчитанная здесь или в браузере, она опиралась бы на остаток, показанный секунду назад.
//
// Заметка обязательна, и пустую останавливает не только этот отказ: поле помечено `required`
// в форме, и браузер не пускает её дальше сам (docs/frontend.md → «Обязательное поле —
// свойство поля»).
type AdjustBody = {
  onHand?: unknown;
  note?: unknown;
};

export default defineEventHandler(async (event): Promise<StockOperationResponse> => {
  const employee = await requireEmployeeRole(event, CATALOG_ROLES);

  const officeId = requireUuidParam(event, 'officeId');
  const productId = requireUuidParam(event, 'productId');
  const body = await readBody<AdjustBody>(event);

  const targetOnHand = typeof body?.onHand === 'number' ? body.onHand : Number(body?.onHand);
  const note = typeof body?.note === 'string' ? body.note : '';

  if (!Number.isFinite(targetOnHand) || note.trim() === '') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'нужны новое значение остатка и заметка',
    });
  }

  try {
    // Остаток после правки читает сервис в своей транзакции и отдаёт его же: ручка
    // в репозиторий не ходит (docs/principles.md → «Слои и зависимости»).
    const stock = await adjustStock({
      officeId,
      productId,
      targetOnHand,
      employeeId: employee.employeeId,
      note,
    });

    return { productId, onHand: stock.onHand, reserved: stock.reserved };
  } catch (error) {
    if (error instanceof MissingAdjustmentNoteError) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: 'правка остатка требует заметки: без неё через месяц её не отличить от ошибки',
      });
    }

    if (error instanceof InvalidStockTargetError) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: 'новое значение остатка должно быть целым неотрицательным числом',
      });
    }

    // Правка на то же число — не успех и не поломка: сотрудник пересчитал полку и нашёл
    // на ней то же самое. Записывать это движением нельзя, а промолчать — значит показать
    // «готово» там, где ничего не произошло.
    if (error instanceof EmptyAdjustmentError) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: 'остаток уже такой: править нечего',
      });
    }

    // `StockWouldGoNegativeError` здесь не разбирается намеренно: правка новым значением
    // в минус не уводит по построению — значение неотрицательно, а остаток после записи
    // равен ровно ему, потому что дельта считается от того же числа, что заблокировано.
    // Ветка на этот отказ была бы недостижимой, а недостижимая ветка однажды начинает врать
    // в разборе: по ней решат, что такой ответ бывает.
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
