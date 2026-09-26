import { countDeskAwaiting } from '#server/repositories/offices';
import { readEmployeeOffices, type OfficeWorker } from '#server/services/offices/employeeOffices';
import type { DeskOfficesResponse } from '#shared/types/orders';

/**
 * Офисы на выборе офиса у стойки Mini App (issue #250): работающие офисы сотрудника и у каждого
 * число ждущих выдачи — заказов и наград вместе.
 *
 * Архивных нет: на телефоне у стойки архивный офис — дверь, в которую никто не придёт.
 * Висящее в закрытом офисе выдаётся и отменяется из веба, где архив показан признаком.
 */
export const readDeskOffices = async (worker: OfficeWorker): Promise<DeskOfficesResponse> => {
  const offices = (await readEmployeeOffices(worker)).filter((office) => !office.archived);

  if (offices.length === 0) {
    return { offices: [] };
  }

  const counts = new Map(
    (await countDeskAwaiting(offices.map((office) => office.officeId))).map((row) => [row.officeId, row.awaitingCount]),
  );

  return {
    offices: offices.map((office) => ({ ...office, awaitingCount: counts.get(office.officeId) ?? 0 })),
  };
};
