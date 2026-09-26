import { adjustPointsManually } from '#server/services/points/adjustPointsManually';
import {
  DriverAccountMissingError,
  InsufficientPointsError,
  InvalidManualAmountError,
  MissingManualNoteError,
} from '#server/services/points/errors';
import { requireDemoEditor, requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { POINTS_ADJUST_ROLES } from '#shared/access';
import type { ManualPointsField, ManualPointsResponse } from '#shared/types/driver';

// Ручная правка баллов водителю: начисление или списание с заметкой.
//
// Ручка пишется от роли, а не от двери: `requireEmployeeRole` одинаково принимает cookie
// веба и `initData` Mini App, и экран сотрудника в Mini App придёт к этой же ручке
// (docs/decisions.md → «Доступ определяется ролью, а не дверью»).
//
// Отказы доменных правил — строкой, при своей ручке (`shared/denials.ts` → граница словаря),
// и с полем формы, к которому относятся: текст встаёт рядом с полем, и решает об этом поле,
// а не разбор текста.
type ManualPointsBody = {
  amount?: unknown;
  note?: unknown;
};

const rejectField = (statusCode: 400 | 409, field: ManualPointsField, message: string) =>
  createError({
    statusCode,
    statusMessage: statusCode === 400 ? 'Bad Request' : 'Conflict',
    message,
    data: { field },
  });

export default defineEventHandler(async (event): Promise<ManualPointsResponse> => {
  const employee = await requireEmployeeRole(event, POINTS_ADJUST_ROLES);

  const personId = requireUuidParam(event, 'personId');

  await requireDemoEditor(employee, { kind: 'person', id: personId });

  const body = await readBody<ManualPointsBody>(event);

  // Строка из чужого клиента разбирается в число здесь, а проверяет его сервис: «целое
  // и не ноль» — правило операции, а не формат запроса.
  const amount = typeof body?.amount === 'number' ? body.amount : Number(body?.amount);
  const note = typeof body?.note === 'string' ? body.note : '';

  try {
    const result = await adjustPointsManually({
      personId,
      amount,
      note,
      employeeId: employee.employeeId,
    });

    return { transferId: result.transferId, balance: Number(result.balance) };
  } catch (error) {
    if (error instanceof InvalidManualAmountError) {
      throw rejectField(400, 'amount', 'сумма — целое число баллов, не ноль; минус списывает');
    }

    if (error instanceof MissingManualNoteError) {
      throw rejectField(
        400,
        'note',
        'ручная правка требует заметки: без неё через месяц её не отличить от ошибки',
      );
    }

    // Отказ базы, переведённый ядром: баланс не тронут, записи в журнале нет.
    if (error instanceof InsufficientPointsError) {
      throw rejectField(409, 'amount', 'на счёте меньше баллов, чем списывается');
    }

    if (error instanceof DriverAccountMissingError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: 'счёта нет — в программе не состоит, править нечего',
      });
    }

    throw error;
  }
});
