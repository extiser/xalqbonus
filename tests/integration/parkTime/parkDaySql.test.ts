import { afterAll, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import { parkDaySql, parkDayStartSql, promoDaySql, promoDayStartSql } from '#server/utils/parkDaySql';
import { disconnectDatabase } from '../support/database';

/**
 * Два понятия дня в сыром SQL (issue #352): календарные сутки приложения и сутки акции
 * с 05:00 (docs/decisions.md → «Сутки — с 00:00 до 00:00 по Ташкенту; у акции — свои,
 * с 05:00»).
 *
 * Выражения исполняет база, поэтому и проверяются настоящей базой: заглушка подтвердила бы
 * строку запроса, а не то, куда Postgres кладёт момент. Таблиц тест не трогает.
 */

/** Момент по часам Ташкента: UTC+5 без перевода часов. */
const tashkent = (moment: string): Date => new Date(`${moment.replace(' ', 'T')}:00+05:00`);

/** Сутки момента выражением `cut` — датой `YYYY-MM-DD`. */
const dayOf = async (cut: (moment: Prisma.Sql) => Prisma.Sql, moment: Date): Promise<string> => {
  const rows = await db.$queryRaw<{ day: string }[]>`
    SELECT to_char(${cut(Prisma.sql`${moment}::timestamptz`)}, 'YYYY-MM-DD') AS "day"
  `;

  return rows[0]?.day ?? '';
};

/** Начало суток даты `day` выражением `start`. */
const startOf = async (start: (day: Prisma.Sql) => Prisma.Sql, day: string): Promise<Date | null> => {
  const rows = await db.$queryRaw<{ moment: Date }[]>`
    SELECT ${start(Prisma.sql`${day}::date`)} AS "moment"
  `;

  return rows[0]?.moment ?? null;
};

describe('сутки в сыром SQL', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  it('календарные сутки режутся в полночь по Ташкенту', async () => {
    expect(await dayOf(parkDaySql, tashkent('2026-10-04 23:59'))).toBe('2026-10-04');
    expect(await dayOf(parkDaySql, tashkent('2026-10-05 00:01'))).toBe('2026-10-05');
    expect(await dayOf(parkDaySql, tashkent('2026-10-05 04:59'))).toBe('2026-10-05');
  });

  it('сутки акции режутся в 05:00: ночь до пяти — ещё вчера', async () => {
    expect(await dayOf(promoDaySql, tashkent('2026-10-05 00:01'))).toBe('2026-10-04');
    expect(await dayOf(promoDaySql, tashkent('2026-10-05 04:59'))).toBe('2026-10-04');
    expect(await dayOf(promoDaySql, tashkent('2026-10-05 05:01'))).toBe('2026-10-05');
  });

  it('начало суток: дата → 00:00 календарных и 05:00 суток акции по Ташкенту', async () => {
    expect((await startOf(parkDayStartSql, '2026-10-05'))?.toISOString()).toBe(
      tashkent('2026-10-05 00:00').toISOString(),
    );
    expect((await startOf(promoDayStartSql, '2026-10-05'))?.toISOString()).toBe(
      tashkent('2026-10-05 05:00').toISOString(),
    );
  });

  it('начало суток обратно резке: момент начала лежит в своих сутках, миг до него — во вчерашних', async () => {
    const calendarStart = await startOf(parkDayStartSql, '2026-10-05');
    const promoStart = await startOf(promoDayStartSql, '2026-10-05');

    if (!calendarStart || !promoStart) {
      throw new Error('начало суток не посчитано');
    }

    expect(await dayOf(parkDaySql, calendarStart)).toBe('2026-10-05');
    expect(await dayOf(parkDaySql, new Date(calendarStart.getTime() - 1))).toBe('2026-10-04');
    expect(await dayOf(promoDaySql, promoStart)).toBe('2026-10-05');
    expect(await dayOf(promoDaySql, new Date(promoStart.getTime() - 1))).toBe('2026-10-04');
  });
});
