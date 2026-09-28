import { consola } from 'consola';

import { insertLegacyAwardedTrips } from '#server/repositories/legacyAwardedTrips';
import type { LegacyReadSession } from '#server/repositories/legacyPublic';

/**
 * Шаг переноса: заказы, за которые балл уже дал старый бот.
 *
 * Баланс переносится одной операцией `opening`, и баллы старого бота за поездки уже лежат
 * в нём. Наш сборщик про них не знает: ключ `trip:<order_id>` живёт только в нашем журнале,
 * и первый догоняющий прогон начислил бы их второй раз. Граница проводится по заказам,
 * а не по времени: старый бот обходит парк часами, и `last_checked` у каждого водителя
 * свой (docs/decisions.md → «Граница со старым ботом — по засчитанным заказам»).
 *
 * Шаг копирует id заказов со статусом `complete` в `xb.legacy_awarded_trips`, начисление
 * их пропускает. Застывшие у старого бота в промежуточном статусе сюда не попадают
 * намеренно: балла за них нет, и наш сборщик начислит их обычным порядком, увидев
 * завершёнными.
 *
 * Идемпотентен: повторный прогон не добавляет строк и не меняет лежащие.
 */

const log = consola.withTag('legacy-import:awarded-trips');

/**
 * На сколько дней назад от момента прогона берутся засчитанные заказы.
 *
 * Обязан быть не меньше `SYNC_CATCHUP_DAYS` (7 по умолчанию, `server/services/sync/config.ts`):
 * проход догоняющего прогона берёт столько дней назад от своего начала, и заказ из этой полосы,
 * не попавший в таблицу, начислится второй раз. Запас вдвое — на то, что окно догона
 * строится по времени завершения, а отбор здесь — по бронированию, и на то, что догон
 * включается не в ту же минуту, что прошёл перенос.
 */
export const LEGACY_AWARDED_TRIPS_DAYS = 14;

const DAY_MS = 86_400_000;

export type LegacyAwardedTripsSummary = {
  /** Нижняя граница отбора по бронированию. */
  bookedSince: Date;
  /** Сколько различных заказов отдала старая схема. */
  read: number;
  /** Сколько вставлено сейчас. При повторном прогоне — ноль. */
  inserted: number;
};

export const importLegacyAwardedTrips = async (
  legacy: Pick<LegacyReadSession, 'readAwardedTrips'>,
  startedAt: Date,
): Promise<LegacyAwardedTripsSummary> => {
  const bookedSince = new Date(startedAt.getTime() - LEGACY_AWARDED_TRIPS_DAYS * DAY_MS);
  const trips = await legacy.readAwardedTrips(bookedSince);
  const inserted = await insertLegacyAwardedTrips(trips, startedAt);

  log.info(
    `засчитанных старым ботом заказов с ${bookedSince.toISOString()}: ${trips.length}, записано сейчас ${inserted}`,
  );

  return { bookedSince, read: trips.length, inserted };
};
