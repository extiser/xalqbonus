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

/**
 * Начало суток парка — обратное к `parkDaySql`: дата → момент, 05:00 этой даты по Ташкенту.
 *
 * Им окно акции превращается из дат, которые вводит сотрудник, в метки: «1–7 октября» —
 * это начало 1-го и начало 8-го, и последний день окна кончается утром восьмого, а не
 * в полночь седьмого (issue #166). Считается здесь, явно от зоны парка, а не у машины.
 */
export const parkDayStartSql = (day: Prisma.Sql): Prisma.Sql => Prisma.sql`
  ((${day})::date + make_interval(hours => ${PARK_DAY_START_HOUR}::int)) AT TIME ZONE ${PARK_TIME_ZONE}::text
`;
