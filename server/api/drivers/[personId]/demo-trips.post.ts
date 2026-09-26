import { addDemoTrips, DEMO_TRIPS_MAX } from '#server/services/demo/addDemoTrips';
import { InvalidDemoTripsError, NotDemoDriverError, type DemoTripsProblem } from '#server/services/demo/errors';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoTripsField, DemoTripsResponse } from '#shared/types/driver';

// Поездки демо-водителю руками (issue #213): прогнать на демо начисление и акцию. Только
// владельцу — демо-сотруднику ручка закрыта и так, `allowDemo` не ставится.
//
// Отказы доменных правил — строкой при своей ручке и с полем запроса, к которому относятся,
// как у ручной правки баллов (`points.post.ts`).
type DemoTripsBody = {
  endedAt?: unknown;
  count?: unknown;
};

const PROBLEMS: Readonly<Record<DemoTripsProblem, { field: DemoTripsField; message: string }>> = {
  count_invalid: { field: 'count', message: `поездок — целое число от 1 до ${DEMO_TRIPS_MAX}` },
  ended_at_invalid: { field: 'endedAt', message: 'время завершения — дата и время в формате ISO' },
  ended_at_future: { field: 'endedAt', message: 'время завершения ещё не наступило: будущей поездки не бывает' },
};

export default defineEventHandler(async (event): Promise<DemoTripsResponse> => {
  await requireEmployeeRole(event, DEMO_EDITOR_ROLES);

  const personId = requireUuidParam(event, 'personId');
  const body = await readBody<DemoTripsBody | null>(event);

  // Строка из клиента разбирается здесь, а проверяет её сервис: «не в будущем» и «от 1 до 30» —
  // правила операции, а не формат запроса. Не строка — дата, которой нет.
  const endedAt = typeof body?.endedAt === 'string' ? new Date(body.endedAt) : new Date(Number.NaN);
  const count = typeof body?.count === 'number' ? body.count : Number(body?.count);

  try {
    return await addDemoTrips({ personId, endedAt, count });
  } catch (error) {
    if (error instanceof NotDemoDriverError) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        message: 'Поездки руками — только демо-водителю',
      });
    }

    if (error instanceof InvalidDemoTripsError) {
      const problem = PROBLEMS[error.problem];

      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: problem.message,
        data: { field: problem.field },
      });
    }

    throw error;
  }
});
