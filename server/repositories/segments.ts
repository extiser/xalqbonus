import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import { PARK_DAY_START_HOUR, PARK_TIME_ZONE } from '#server/utils/parkTime';
// Относительным путём, а не через `#shared`: состав сегмента заберёт рассылка, а её модули
// собираются в воркер, бандл которого знает только псевдоним `#server` (package.json →
// build:worker).
import { hasSegmentConditions } from '../../shared/segment';
import type { SegmentConditions } from '../../shared/types/segment';

/**
 * Сегменты водителей и их состав.
 *
 * Сегмент хранит условия, а не людей: состав берётся запросом в тот момент, когда понадобился
 * (issue #165). Поэтому главное в файле — `segmentMembersSql`, единственное место, где условия
 * превращаются в отбор. Счётчик, страница предпросмотра и выдача состава потребителю
 * оборачивают его и своего `WHERE` не заводят: два места, строящие запрос по одним и тем же
 * условиям, разошлись бы на первой правке, и разошлись бы тихо — экран показал бы одно
 * число, а рассылка ушла бы другому составу.
 *
 * Схема в сыром SQL указывается явно — `xb.segments`, а не `segments`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

type Executor = Prisma.TransactionClient;

export type SegmentRow = {
  id: string;
  name: string;
  description: string | null;
  daysSinceTripMin: number | null;
  daysSinceTripMax: number | null;
  programMember: boolean | null;
  telegramLinked: boolean | null;
  balanceMin: bigint | null;
  balanceMax: bigint | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

const SEGMENT_SELECT = Prisma.sql`
  SELECT segment."id",
         segment."name",
         segment."description",
         segment."days_since_trip_min" AS "daysSinceTripMin",
         segment."days_since_trip_max" AS "daysSinceTripMax",
         segment."program_member"      AS "programMember",
         segment."telegram_linked"     AS "telegramLinked",
         segment."balance_min"         AS "balanceMin",
         segment."balance_max"         AS "balanceMax",
         author."full_name"            AS "createdByName",
         segment."created_at"          AS "createdAt",
         segment."updated_at"          AS "updatedAt",
         segment."archived_at"         AS "archivedAt"
    FROM xb.segments AS segment
    JOIN xb.employees AS author ON author."id" = segment."created_by_id"
`;

/**
 * Все сегменты — и рабочие, и архивные, архивные последними. Их единицы и десятки, страниц
 * не нужно. Архив не прячется, а помечается: «сегмента нет в списке» не должно означать
 * «сегмент убран».
 */
export const listSegments = async (client: Executor = db): Promise<SegmentRow[]> =>
  client.$queryRaw<SegmentRow[]>`
    ${SEGMENT_SELECT}
     ORDER BY (segment."archived_at" IS NOT NULL), segment."created_at" DESC
  `;

export const findSegment = async (
  segmentId: string,
  client: Executor = db,
): Promise<SegmentRow | null> => {
  const rows = await client.$queryRaw<SegmentRow[]>`
    ${SEGMENT_SELECT}
     WHERE segment."id" = ${segmentId}::uuid
  `;

  return rows[0] ?? null;
};

export type SegmentInput = {
  name: string;
  description: string | null;
  conditions: SegmentConditions;
};

/** Заводит сегмент. Возвращает идентификатор: строку с автором читает сервис. */
export const insertSegment = async (
  input: SegmentInput & { createdById: string },
  client: Executor = db,
): Promise<string> => {
  const { conditions } = input;

  const rows = await client.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.segments (
      "name", "description",
      "days_since_trip_min", "days_since_trip_max",
      "program_member", "telegram_linked",
      "balance_min", "balance_max",
      "created_by_id"
    )
    VALUES (
      ${input.name},
      ${input.description},
      ${conditions.daysSinceTripMin}::int,
      ${conditions.daysSinceTripMax}::int,
      ${conditions.programMember}::boolean,
      ${conditions.telegramLinked}::boolean,
      ${conditions.balanceMin}::bigint,
      ${conditions.balanceMax}::bigint,
      ${input.createdById}::uuid
    )
    RETURNING "id"
  `;

  const row = rows[0];

  if (!row) {
    throw new Error('вставка сегмента не вернула строку');
  }

  return row.id;
};

/**
 * Правка сегмента целиком: форма отдаёт все поля сразу. Отметка архива этой правкой
 * не двигается — у неё своё действие. `false` — сегмента нет.
 */
export const updateSegmentFields = async (
  segmentId: string,
  input: SegmentInput,
  client: Executor = db,
): Promise<boolean> => {
  const { conditions } = input;

  const updated = await client.$executeRaw`
    UPDATE xb.segments
       SET "name"                = ${input.name},
           "description"         = ${input.description},
           "days_since_trip_min" = ${conditions.daysSinceTripMin}::int,
           "days_since_trip_max" = ${conditions.daysSinceTripMax}::int,
           "program_member"      = ${conditions.programMember}::boolean,
           "telegram_linked"     = ${conditions.telegramLinked}::boolean,
           "balance_min"         = ${conditions.balanceMin}::bigint,
           "balance_max"         = ${conditions.balanceMax}::bigint,
           "updated_at"          = now()
     WHERE "id" = ${segmentId}::uuid
  `;

  return updated > 0;
};

/**
 * Архив и возврат. Повтор на уже архивном время архива не двигает: две нажатые кнопки
 * означают одно и то же состояние. `false` — сегмента нет.
 */
export const updateSegmentArchived = async (
  segmentId: string,
  archived: boolean,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.segments
       SET "archived_at" = CASE
                             WHEN ${archived}::boolean THEN coalesce("archived_at", now())
                             ELSE NULL
                           END,
           "updated_at"  = now()
     WHERE "id" = ${segmentId}::uuid
  `;

  return updated > 0;
};

// ---------------------------------------------------------------------------
// Состав
// ---------------------------------------------------------------------------

/**
 * Сутки парка момента: сдвиг на начало суток в зоне парка и дата. Вычитание двух таких дат
 * даёт целое число суток — ровно то, что стоит в колонке «дней с поездки».
 */
const parkDay = (moment: Prisma.Sql): Prisma.Sql => Prisma.sql`
  ((${moment} AT TIME ZONE ${PARK_TIME_ZONE}::text) - make_interval(hours => ${PARK_DAY_START_HOUR}::int))::date
`;

/**
 * Построитель отбора — единственный. Принимает условия, отдаёт SQL множества людей
 * с тем, по чему отбирали: `personId`, `daysSinceTrip`, `telegramLinked`, `balance`.
 *
 * Отбирает по реестру парка (`persons`), а не по участникам: участие — одно из условий,
 * и срез «не в программе» — тоже срез.
 *
 * Давность считается от `trips.ended_at` завершённых заказов (`status = 'complete'`) через
 * `park_profiles` к человеку — по всем его учёткам сразу: увольнение и заведение заново дают
 * второй профиль, а человек один (docs/drivers.md). Считается в сутках парка с 05:00
 * по Ташкенту (docs/decisions.md → «Сутки — с 05:00 до 05:00»), от `now()` базы.
 *
 * Отсутствие поездок — не «давно ездил»: у такого человека давность `NULL`, и сравнение
 * с любой границей его не пропускает. Так же баланс: нет водительского счёта — под условие
 * по балансу человек не подходит, «счёта нет» и «на счету ноль» — разные вещи.
 *
 * Незаданное условие отключается сравнением `IS NULL` на самом параметре, а не сборкой
 * строки запроса из кусков — как в поиске водителей: собранный конкатенацией SQL — это то
 * место, где однажды оказывается пользовательский ввод.
 *
 * Условий нет — отбора нет: здесь, а не только у ручки, потому что это единственная дверь
 * к составу, и сегмент без условий через неё не отдаст весь реестр ни одному потребителю.
 */
export const segmentMembersSql = (conditions: SegmentConditions): Prisma.Sql => {
  if (!hasSegmentConditions(conditions)) {
    throw new Error('сегмент без условий состава не отдаёт');
  }

  return Prisma.sql`
    SELECT candidate."personId",
           candidate."daysSinceTrip",
           candidate."telegramLinked",
           candidate."balance"
      FROM (
            SELECT person."id"                                    AS "personId",
                   (${parkDay(Prisma.sql`now()`)} - ${parkDay(Prisma.sql`activity."lastTripEndedAt"`)})
                                                                  AS "daysSinceTrip",
                   (settings."person_id" IS NOT NULL)             AS "programMember",
                   (link."person_id" IS NOT NULL)                 AS "telegramLinked",
                   account."balance"
              FROM xb.persons AS person
              -- Последняя завершённая поездка — одним проходом по поездкам на весь реестр,
              -- а не подзапросом на каждого человека: счётчику нужен весь реестр целиком.
              LEFT JOIN (
                   SELECT profile."person_id",
                          max(trip."ended_at") AS "lastTripEndedAt"
                     FROM xb.trips AS trip
                     JOIN xb.park_profiles AS profile ON profile."profile_id" = trip."profile_id"
                    WHERE trip."status" = 'complete'
                    GROUP BY profile."person_id"
              ) AS activity ON activity."person_id" = person."id"
              LEFT JOIN xb.person_settings AS settings ON settings."person_id" = person."id"
              -- Активная привязка у человека одна — частичным уникальным индексом, строк
              -- соединение не множит.
              LEFT JOIN xb.telegram_links AS link
                     ON link."person_id" = person."id" AND link."closed_at" IS NULL
              LEFT JOIN xb.accounts AS account
                     ON account."person_id" = person."id" AND account."type" = 'driver'
           ) AS candidate
     WHERE (${conditions.daysSinceTripMin}::int IS NULL
            OR candidate."daysSinceTrip" >= ${conditions.daysSinceTripMin}::int)
       AND (${conditions.daysSinceTripMax}::int IS NULL
            OR candidate."daysSinceTrip" <= ${conditions.daysSinceTripMax}::int)
       AND (${conditions.programMember}::boolean IS NULL
            OR candidate."programMember" = ${conditions.programMember}::boolean)
       AND (${conditions.telegramLinked}::boolean IS NULL
            OR candidate."telegramLinked" = ${conditions.telegramLinked}::boolean)
       AND (${conditions.balanceMin}::bigint IS NULL
            OR candidate."balance" >= ${conditions.balanceMin}::bigint)
       AND (${conditions.balanceMax}::bigint IS NULL
            OR candidate."balance" <= ${conditions.balanceMax}::bigint)
  `;
};

export type SegmentCountRow = {
  total: number;
  /** `now()` базы — тот же момент, от которого считались сутки. */
  calculatedAt: Date;
};

export const countSegmentMembers = async (
  conditions: SegmentConditions,
  client: Executor = db,
): Promise<SegmentCountRow> => {
  const rows = await client.$queryRaw<SegmentCountRow[]>`
    SELECT count(*)::int AS "total",
           now()         AS "calculatedAt"
      FROM (${segmentMembersSql(conditions)}) AS member
  `;

  const row = rows[0];

  if (!row) {
    throw new Error('подсчёт состава сегмента не вернул строку');
  }

  return row;
};

export type SegmentMemberRow = {
  personId: string;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  callsigns: string[];
  balance: bigint | null;
  daysSinceTrip: number | null;
  telegramLinked: boolean;
};

/**
 * Страница состава. Имя и позывные подтягиваются поверх отбора и в него не входят: отбирает
 * построитель, а здесь только то, что нужно показать.
 *
 * Порядок — по фамилии, затем идентификатором человека: без него две страницы одного запроса
 * могут показать одну и ту же строку дважды.
 */
export const listSegmentMembersPage = async (
  conditions: SegmentConditions,
  limit: number,
  offset: number,
  client: Executor = db,
): Promise<SegmentMemberRow[]> =>
  client.$queryRaw<SegmentMemberRow[]>`
    WITH member AS (${segmentMembersSql(conditions)})
    SELECT member."personId",
           profile."lastName",
           profile."firstName",
           profile."middleName",
           profiles."callsigns",
           member."balance",
           member."daysSinceTrip",
           member."telegramLinked"
      FROM member
      -- Профиль для показа — как в поиске: работающий важнее уволенного, среди равных
      -- свежий по отметке API.
      LEFT JOIN LATERAL (
        SELECT candidate."last_name"   AS "lastName",
               candidate."first_name"  AS "firstName",
               candidate."middle_name" AS "middleName"
          FROM xb.park_profiles AS candidate
         WHERE candidate."person_id" = member."personId"
         ORDER BY (candidate."work_status" = 'working') DESC, candidate."api_updated_at" DESC
         LIMIT 1
      ) AS profile ON TRUE
      LEFT JOIN LATERAL (
        SELECT coalesce(
                 array_agg(DISTINCT candidate."callsign")
                   FILTER (WHERE candidate."callsign" IS NOT NULL),
                 ARRAY[]::text[]
               ) AS "callsigns"
          FROM xb.park_profiles AS candidate
         WHERE candidate."person_id" = member."personId"
      ) AS profiles ON TRUE
     ORDER BY profile."lastName" ASC NULLS LAST,
              profile."firstName" ASC NULLS LAST,
              member."personId" ASC
     LIMIT ${limit} OFFSET ${offset}
  `;

/**
 * Состав целиком — идентификаторами людей, для потребителя: рассылки, акции. Тот же
 * построитель, что у счётчика экрана, поэтому число строк здесь равно числу в предпросмотре
 * на тот же момент.
 */
export const listSegmentPersonIds = async (
  conditions: SegmentConditions,
  client: Executor = db,
): Promise<string[]> => {
  const rows = await client.$queryRaw<{ personId: string }[]>`
    SELECT member."personId"
      FROM (${segmentMembersSql(conditions)}) AS member
     ORDER BY member."personId"
  `;

  return rows.map((row) => row.personId);
};
