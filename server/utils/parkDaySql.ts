import { Prisma } from '#server/generated/prisma/client';
import { PARK_TIME_ZONE, PROMO_DAY_START_HOUR } from '#server/utils/parkTime';

/**
 * Сутки момента — выражением SQL: дата в зоне парка, календарная, с полуночи по Ташкенту.
 *
 * Резка суток в сыром SQL одна на проект, как и в коде (`formatDayKey` в `parkTime.ts`):
 * сутки приложения календарные (docs/decisions.md → «Сутки — с 00:00 до 00:00 по Ташкенту;
 * у акции — свои, с 05:00»). Вторая копия выражения однажды резала бы иначе, и один и тот же
 * вечер лёг бы в разные дни на соседних экранах. Сутки акции — `promoDaySql` ниже.
 *
 * Вычитание двух таких дат даёт целое число суток между моментами.
 */
export const parkDaySql = (moment: Prisma.Sql): Prisma.Sql => Prisma.sql`
  (${moment} AT TIME ZONE ${PARK_TIME_ZONE}::text)::date
`;

/**
 * Начало суток — обратное к `parkDaySql`: дата → момент, 00:00 этой даты по Ташкенту.
 *
 * Им границы, которые вводят датами, — период отчёта, срок подарка, — превращаются в метки.
 * Считается здесь, явно от зоны парка, а не у машины.
 */
export const parkDayStartSql = (day: Prisma.Sql): Prisma.Sql => Prisma.sql`
  ((${day})::date::timestamp) AT TIME ZONE ${PARK_TIME_ZONE}::text
`;

/**
 * Сутки акции момента — с 05:00 по Ташкенту: сдвиг на начало суток акции и дата.
 *
 * Свои сутки только у акции (docs/decisions.md → «Сутки — с 00:00 до 00:00 по Ташкенту;
 * у акции — свои, с 05:00»): поездка в 02:30 для недели акции — вчерашний день. Вне кода
 * акции не применяется.
 *
 * Вычитание двух таких дат даёт целое число суток акции между моментами.
 */
export const promoDaySql = (moment: Prisma.Sql): Prisma.Sql => Prisma.sql`
  ((${moment} AT TIME ZONE ${PARK_TIME_ZONE}::text) - make_interval(hours => ${PROMO_DAY_START_HOUR}::int))::date
`;

/**
 * Начало суток акции — обратное к `promoDaySql`: дата → момент, 05:00 этой даты по Ташкенту.
 *
 * Им окно акции превращается из дат, которые вводит сотрудник, в метки: «1–7 октября» —
 * это начало 1-го и начало 8-го, и последний день окна кончается утром восьмого, а не
 * в полночь седьмого (issue #166).
 */
export const promoDayStartSql = (day: Prisma.Sql): Prisma.Sql => Prisma.sql`
  ((${day})::date + make_interval(hours => ${PROMO_DAY_START_HOUR}::int)) AT TIME ZONE ${PARK_TIME_ZONE}::text
`;
