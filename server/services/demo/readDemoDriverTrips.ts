import { findDemoFlag, listDemoDriverTrips } from '#server/repositories/demo';
import { NotDemoDriverError } from '#server/services/demo/errors';
import type { DemoDriverTripsResponse } from '#shared/types/demo';

/**
 * Поездки демо-водителя в разделе «Демо» (issue #252): последние завершённые и что по каждой
 * начислено. Раскрывается по кнопке «Поездки» — проверить, как механика прошла на демо,
 * не открывая карточку.
 *
 * Только демо-водителю: для живых — отдельная задача, и «не демо» отвечает тем же отказом,
 * что «нет такого».
 */

/** Сколько поездок показывается — последние: столько пишет один запрос «Добавить поездки». */
export const DEMO_DRIVER_TRIPS_LIMIT = 30;

export const readDemoDriverTrips = async (personId: string): Promise<DemoDriverTripsResponse> => {
  if ((await findDemoFlag('person', personId)) !== true) {
    throw new NotDemoDriverError(personId);
  }

  const rows = await listDemoDriverTrips(personId, DEMO_DRIVER_TRIPS_LIMIT);

  return {
    personId,
    trips: rows.map((row) => ({
      orderId: row.orderId,
      endedAt: row.endedAt.toISOString(),
      points: row.points === null ? null : Number(row.points),
    })),
  };
};
