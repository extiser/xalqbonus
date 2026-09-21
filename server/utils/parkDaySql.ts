import { Prisma } from '#server/generated/prisma/client';
import { PARK_DAY_START_HOUR, PARK_TIME_ZONE } from '#server/utils/parkTime';

/**
 * Сутки парка момента — выражением SQL: сдвиг на начало суток в зоне парка и дата.
 *
 * Резка суток в сыром SQL одна на проект, как и в коде (`parkTime.ts`): сутки начинаются
 * в 05:00 по Ташкенту (docs/decisions.md → «Сутки — с 05:00 до 05:00 по Ташкенту, одни
 * на всё приложение»). Вторая копия выражения однажды резала бы по полуночи, и один и тот же
 * вечер лёг бы в разные дни на соседних экранах.
 *
 * Вычитание двух таких дат даёт целое число суток парка между моментами.
 */
export const parkDaySql = (moment: Prisma.Sql): Prisma.Sql => Prisma.sql`
  ((${moment} AT TIME ZONE ${PARK_TIME_ZONE}::text) - make_interval(hours => ${PARK_DAY_START_HOUR}::int))::date
`;
