import { randomInt } from 'node:crypto';

import { consola } from 'consola';

import { db } from '#server/db';
import { findMaxGeneratedDemoNumber, lockDemoGenerator } from '#server/repositories/demo';
import { addDemoTrips, DEMO_TRIPS_MAX } from '#server/services/demo/addDemoTrips';
import { DEMO_DRIVER_CALLSIGN, DEMO_DRIVER_FIRST_NAME } from '#server/services/demo/addDemoViewer';
import { createDemoDriver } from '#server/services/demo/createDemoDriver';
import { InvalidDemoGenerateError } from '#server/services/demo/errors';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import type { DemoGenerateField, DemoProgramMember } from '#shared/types/demo';

/**
 * Генератор демо-водителей (issue #252): пачка выдуманных водителей с разбросом баланса,
 * поездок, давности и участия — под условия демо-сегментов.
 *
 * Каждый водитель — своей транзакцией: сорвавшийся на десятом оставляет девять целыми, а не
 * откатывает пачку. Поездки — после, путём `addDemoTrips`, тем же, что у кнопки «Добавить
 * поездки»: механика на сгенерированном — живая механика, и участнику пятая поездка приносит
 * приветственные 300 сверх заданного баланса. Так и задумано.
 *
 * Участник с поездками вступил в программу за сутки до последней из них: приветственный бонус
 * считает только поездки после вступления, и вступивший «сейчас» после поездок в прошлом его
 * не получил бы никогда. Без поездок — вступил сейчас.
 *
 * Имя — «ДЕМО ВОДИТЕЛЬ N», позывной — «ДЕМО-N»: номер следующий после наибольшего среди
 * сгенерированных, включая спрятанных. Привязки Telegram у сгенерированного нет.
 */
const log = consola.withTag('demo:generate');

/** Потолок пачки: на срезы демо-сегментов хватает, а сотня заведений разом — уже не показ. */
export const DEMO_GENERATE_MAX = 50;

const DAY_MS = 24 * 60 * 60 * 1_000;

export type GenerateDemoDriversRequest = {
  count: number;
  balanceMin: number;
  balanceMax: number;
  tripsMin: number;
  tripsMax: number;
  lastTripDaysMin: number;
  lastTripDaysMax: number;
  programMember: DemoProgramMember;
  now?: Date;
};

const isWhole = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

const requireValid = (condition: boolean, field: DemoGenerateField): void => {
  if (!condition) {
    throw new InvalidDemoGenerateError(field);
  }
};

const validate = (request: GenerateDemoDriversRequest): void => {
  requireValid(isWhole(request.count) && request.count >= 1 && request.count <= DEMO_GENERATE_MAX, 'count');
  requireValid(isWhole(request.balanceMin), 'balanceMin');
  requireValid(isWhole(request.balanceMax) && request.balanceMax >= request.balanceMin, 'balanceMax');
  requireValid(isWhole(request.tripsMin) && request.tripsMin <= DEMO_TRIPS_MAX, 'tripsMin');
  requireValid(
    isWhole(request.tripsMax) && request.tripsMax >= request.tripsMin && request.tripsMax <= DEMO_TRIPS_MAX,
    'tripsMax',
  );

  // Без поездок давности нет — поля не читаются.
  if (request.tripsMax > 0) {
    requireValid(isWhole(request.lastTripDaysMin), 'lastTripDaysMin');
    requireValid(
      isWhole(request.lastTripDaysMax) && request.lastTripDaysMax >= request.lastTripDaysMin,
      'lastTripDaysMax',
    );
  }

  requireValid(['yes', 'no', 'mixed'].includes(request.programMember), 'programMember');
};

/** Случайное целое в `[min, max]` включительно. */
const between = (min: number, max: number): number => randomInt(min, max + 1);

const memberOf = (programMember: DemoProgramMember): boolean =>
  programMember === 'mixed' ? randomInt(2) === 1 : programMember === 'yes';

export const generateDemoDrivers = async (request: GenerateDemoDriversRequest): Promise<{ created: number }> => {
  validate(request);

  const now = request.now ?? new Date();
  const emission = await getSystemAccount('emission');
  let created = 0;

  for (let step = 0; step < request.count; step += 1) {
    const balance = between(request.balanceMin, request.balanceMax);
    const programMember = memberOf(request.programMember);
    const trips = between(request.tripsMin, request.tripsMax);
    const lastTripAt =
      trips > 0
        ? new Date(now.getTime() - between(request.lastTripDaysMin, request.lastTripDaysMax) * DAY_MS)
        : null;

    const driver = await db.$transaction(async (transaction) => {
      await lockDemoGenerator(transaction);

      const number = (await findMaxGeneratedDemoNumber(DEMO_DRIVER_FIRST_NAME, transaction)) + 1;

      return createDemoDriver(transaction, emission.id, {
        firstName: `${DEMO_DRIVER_FIRST_NAME} ${number}`,
        callsign: `${DEMO_DRIVER_CALLSIGN}-${number}`,
        balance,
        programMember,
        now,
        joinedAt: lastTripAt ? new Date(lastTripAt.getTime() - DAY_MS) : now,
      });
    });

    if (lastTripAt) {
      await addDemoTrips({ personId: driver.personId, endedAt: lastTripAt, count: trips, now });
    }

    created += 1;
  }

  log.info('демо-водители сгенерированы', { created });

  return { created };
};
