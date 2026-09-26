import { randomUUID } from 'node:crypto';

import { consola } from 'consola';

import { findDemoFlag } from '#server/repositories/demo';
import { findDisplayProfile } from '#server/repositories/registry';
import { upsertTrips, type TripInput } from '#server/repositories/trips';
import { awardTripPoints } from '#server/services/points/awardTripPoints';
import { InvalidDemoTripsError, NotDemoDriverError } from '#server/services/demo/errors';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';

/**
 * Поездки демо-водителю руками (issue #213): у демо-водителя живых поездок нет, Fleet API
 * его не знает, а прогнать на демо начисление и акцию — зачётный день, сундуки, итог — нужно.
 *
 * Поездка идёт тем же путём, что из синхронизации: запись — `upsertTrips`, начисление —
 * `awardTripPoints`. Дальше история, зачётный день и сундуки видят её как любую другую,
 * и механика, прогнанная на демо, — это живая механика: своей ветки под демо нет нигде.
 * Следствие того же правила: пятая поездка после вступления приносит и приветственный бонус.
 *
 * Синхронизация ручную поездку не тронет: `order_id` у неё `demo-…`, а в ответе Fleet API
 * такого заказа не будет никогда. Свод синхронизации демо не считает (`syncSummary.ts`).
 */

const log = consola.withTag('demo:trips');

/** Потолок одного запроса: на целевое количество дня акции хватает с запасом. */
export const DEMO_TRIPS_MAX = 30;

/** Шаг между завершениями соседних поездок: последняя завершается ровно в `endedAt`. */
const TRIP_STEP_MS = 60_000;

/** Сколько поездка длится: подача, посадка и создание заказа — за столько до завершения. */
const TRIP_DURATION_MS = 20 * 60_000;

/** Значение словарных полей Fleet API у ручной поездки — видно, откуда она взялась. */
const DEMO_TRIP_SOURCE = 'demo';

export type AddDemoTripsRequest = {
  personId: string;
  /** Время завершения последней поездки. */
  endedAt: Date;
  count: number;
  now?: Date;
};

export type AddDemoTripsResult = {
  /** Сколько поездок записано. */
  written: number;
  /** Сколько поездок начислено — по баллу за каждую. */
  awarded: number;
  /** Приветственных бонусов выдано этим запросом — ноль или один: пятая поездка после вступления. */
  welcomeAwarded: number;
};

const buildTrip = (profileId: string, endedAt: Date): TripInput => {
  const startedAt = new Date(endedAt.getTime() - TRIP_DURATION_MS);

  return {
    orderId: `demo-${randomUUID()}`,
    shortId: null,
    profileId,
    status: COMPLETED_TRIP_STATUS,
    category: DEMO_TRIP_SOURCE,
    paymentMethod: DEMO_TRIP_SOURCE,
    provider: DEMO_TRIP_SOURCE,
    orderTypeId: null,
    orderTypeName: null,
    workRuleId: null,
    bookedAt: startedAt,
    apiCreatedAt: startedAt,
    drivingAt: startedAt,
    endedAt,
    price: '0',
    mileage: null,
    carId: DEMO_TRIP_SOURCE,
    carCallsign: null,
    carLicenseNumber: 'DEMO',
    carBrandModel: '',
    addressFromText: '',
    addressFromLat: 0,
    addressFromLon: 0,
    cancellationDescription: null,
    flags: [],
    amenities: [],
  };
};

export const addDemoTrips = async (request: AddDemoTripsRequest): Promise<AddDemoTripsResult> => {
  // Признак демо — первым: живому водителю отказ один, что бы ни пришло в теле.
  if ((await findDemoFlag('person', request.personId)) !== true) {
    throw new NotDemoDriverError(request.personId);
  }

  const { count, endedAt } = request;
  const now = request.now ?? new Date();

  if (!Number.isInteger(count) || count < 1 || count > DEMO_TRIPS_MAX) {
    throw new InvalidDemoTripsError('count_invalid');
  }

  if (Number.isNaN(endedAt.getTime())) {
    throw new InvalidDemoTripsError('ended_at_invalid');
  }

  // Будущей поездки не бывает: начисление с датой вперёд сломало бы историю и сутки акции.
  if (endedAt.getTime() > now.getTime()) {
    throw new InvalidDemoTripsError('ended_at_future');
  }

  // Профиль у демо-водителя один — заведённый вместе с ним (`insertDemoParkProfile`). Его
  // отсутствие — сломанное демо, а не отказ запроса.
  const profile = await findDisplayProfile(request.personId);

  if (!profile) {
    throw new Error(`у демо-водителя ${request.personId} нет профиля в парке`);
  }

  const trips = Array.from({ length: count }, (_unused, index) =>
    buildTrip(profile.profileId, new Date(endedAt.getTime() - index * TRIP_STEP_MS)),
  );

  // Прогона синхронизации у ручной поездки нет — `sync_run_id` пуст.
  const written = await upsertTrips(trips, null, now);
  const accrual = await awardTripPoints([...written.keys()]);

  log.info('Поездки демо-водителю записаны', {
    personId: request.personId,
    written: written.size,
    awarded: accrual.awarded,
    welcomeAwarded: accrual.welcomeAwarded,
  });

  return { written: written.size, awarded: accrual.awarded, welcomeAwarded: accrual.welcomeAwarded };
};
