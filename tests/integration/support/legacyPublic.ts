import { db } from '#server/db';

/**
 * Таблица `public."Trips"` старого бота — для теста шага переноса засчитанных заказов.
 *
 * **Единственное место в проекте, где пишется `public`, и это исключение, а не лазейка.**
 * Правило «`public` только читается» (CLAUDE.md → «Важные ограничения») защищает данные
 * старого бота. В тестовой базе их нет: её `public` пуста и старому боту не принадлежит.
 * А проверить отбор «только `complete` за 14 дней» и схлопывание дублей `trip_id` можно
 * только настоящим SQL шага по настоящей таблице — заглушка сеанса подтвердила бы код,
 * а не запрос, который пойдёт на прод (issue #274).
 *
 * Исключение узкое по построению:
 *   - только база с суффиксом `_test` — это держит `tests/setup.ts` на весь прогон, и ещё раз
 *     проверяется здесь, у самой записи, ответом базы, а не строкой подключения;
 *   - только таблица `Trips` и только те колонки, что читает шаг;
 *   - таблица заводится тестом и удаляется им же в `afterAll`.
 */

const REQUIRED_DATABASE_SUFFIX = '_test';

const assertTestDatabase = async (): Promise<void> => {
  const rows = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS "name"`;
  const name = rows[0]?.name ?? '';

  if (!name.endsWith(REQUIRED_DATABASE_SUFFIX)) {
    throw new Error(`public."Trips" заводится только в тестовой базе, а соединение смотрит в ${name}`);
  }
};

/**
 * Заводит таблицу. Оставшаяся от упавшего прогона снимается сначала: в тестовой базе
 * ей неоткуда взяться, кроме как от этого же теста.
 */
export const createLegacyTripsTable = async (): Promise<void> => {
  await assertTestDatabase();

  await db.$executeRaw`DROP TABLE IF EXISTS public."Trips"`;
  // Колонки и типы — как в миграции старого бота (`20241218170710-add-trips-table.js`),
  // без уникального индекса на `trip_id`: его нет и в боевой базе, дубли там есть.
  await db.$executeRaw`
    CREATE TABLE public."Trips" (
      "id"        SERIAL PRIMARY KEY,
      "driver_id" INTEGER NOT NULL,
      "trip_id"   VARCHAR(255) NOT NULL,
      "booked_at" TIMESTAMPTZ NOT NULL,
      "status"    VARCHAR(255)
    )
  `;
};

export type LegacyTripInput = {
  tripId: string;
  driverId: number;
  bookedAt: Date;
  status: string;
};

/** Строки кладутся в порядке списка: при дублях `trip_id` шаг берёт самую раннюю по `id`. */
export const insertLegacyTrips = async (trips: readonly LegacyTripInput[]): Promise<void> => {
  await assertTestDatabase();

  for (const trip of trips) {
    await db.$executeRaw`
      INSERT INTO public."Trips" ("driver_id", "trip_id", "booked_at", "status")
      VALUES (${trip.driverId}, ${trip.tripId}, ${trip.bookedAt}, ${trip.status})
    `;
  }
};

/**
 * Опустошает таблицу между тестами: шаг читает её целиком, и строки прошлого теста
 * легли бы в `legacy_awarded_trips` снова — мимо уборки, которая их уже отпустила.
 */
export const clearLegacyTrips = async (): Promise<void> => {
  await assertTestDatabase();

  await db.$executeRaw`TRUNCATE public."Trips"`;
};

export const dropLegacyTripsTable = async (): Promise<void> => {
  await assertTestDatabase();

  await db.$executeRaw`DROP TABLE IF EXISTS public."Trips"`;
};
