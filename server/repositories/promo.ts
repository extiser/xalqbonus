import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { PromoMedium } from '#server/generated/prisma/enums';
import { parkDaySql } from '#server/utils/parkDaySql';

/**
 * Переходы по промо-меткам (issue #377) и справочник меток с воронкой (issue #380).
 *
 * Схема в сыром SQL указывается явно: у соединения драйверного адаптера `search_path`
 * дефолтный, и запрос без префикса молча ушёл бы в `public` (docs/decisions.md).
 */

export type PromoTouchInput = {
  /** Код метки целиком, с префиксом: `p_poster1`. */
  code: string;
  telegramUserId: bigint;
  telegramChatId: bigint;
};

export type PromoTouchRow = {
  personId: string | null;
  wasParticipant: boolean;
};

/**
 * Кладёт строку касания и тем же запросом определяет человека и признак участника.
 *
 * Привязка ищется по отправителю, а у строк, где он пуст, — по чату: у перенесённых
 * из старой базы привязок `telegram_user_id` нет, есть только `telegram_chat_id`.
 * Человек — с живой привязкой; участник — хоть одна привязка, живая или закрытая
 * (docs/decisions.md → «Баллы в метриках дашборда»).
 *
 * Живая привязка на Telegram одна — частичный уникальный индекс по чату; порядок по дате
 * только делает выбор однозначным, если отправитель и чат разойдутся.
 */
export const insertPromoTouch = async (touch: PromoTouchInput): Promise<PromoTouchRow> => {
  const telegramUserId = touch.telegramUserId.toString();
  const telegramChatId = touch.telegramChatId.toString();

  const rows = await db.$queryRaw<PromoTouchRow[]>`
    WITH links AS (
      SELECT link."person_id", link."closed_at", link."linked_at"
        FROM xb.telegram_links AS link
       WHERE link."telegram_user_id" = ${telegramUserId}::text::bigint
          OR (link."telegram_user_id" IS NULL AND link."telegram_chat_id" = ${telegramChatId}::text::bigint)
    )
    INSERT INTO xb.promo_touches (
      "code", "telegram_user_id", "telegram_chat_id", "person_id", "was_participant"
    )
    VALUES (
      ${touch.code},
      ${telegramUserId}::text::bigint,
      ${telegramChatId}::text::bigint,
      (SELECT links."person_id" FROM links WHERE links."closed_at" IS NULL
        ORDER BY links."linked_at" DESC LIMIT 1),
      EXISTS (SELECT 1 FROM links)
    )
    RETURNING "person_id" AS "personId", "was_participant" AS "wasParticipant"
  `;

  const row = rows[0];

  if (row === undefined) {
    throw new Error('вставка касания промо-метки не вернула строку');
  }

  return row;
};

// ---------------------------------------------------------------------------
// Справочник меток
// ---------------------------------------------------------------------------

export type PromoLinkInput = {
  code: string;
  name: string;
  medium: PromoMedium;
  placement: string | null;
  createdByEmployeeId: string;
};

/**
 * Заводит метку. `false` — код уже занят: первичный ключ отбил вставку, и это исход,
 * а не ошибка — двое, нажавшие «Создать» с одним кодом, получают отказ по полю.
 */
export const insertPromoLink = async (link: PromoLinkInput): Promise<boolean> => {
  const { count } = await db.promoLink.createMany({ data: [link], skipDuplicates: true });

  return count === 1;
};

/** Правит название и место. `false` — метки с таким кодом нет. */
export const updatePromoLinkFields = async (
  code: string,
  fields: { name: string; placement: string | null },
): Promise<boolean> => {
  const { count } = await db.promoLink.updateMany({ where: { code }, data: fields });

  return count === 1;
};

/**
 * Занят ли код: метка с ним уже заведена или по нему уже были касания. Второе — ради кода,
 * который кто-то набрал руками в ссылке: выданный заново, он получил бы чужие касания.
 */
export const isPromoCodeTaken = async (code: string): Promise<boolean> => {
  const [link, touch] = await Promise.all([
    db.promoLink.findUnique({ where: { code }, select: { code: true } }),
    db.promoTouch.findFirst({ where: { code }, select: { id: true } }),
  ]);

  return link !== null || touch !== null;
};

export type PromoLinkRecord = {
  code: string;
  name: string;
  medium: PromoMedium;
  placement: string | null;
  createdAt: Date;
  createdBy: string | null;
};

export const findPromoLink = async (code: string): Promise<PromoLinkRecord | null> => {
  const link = await db.promoLink.findUnique({
    where: { code },
    select: {
      code: true,
      name: true,
      medium: true,
      placement: true,
      createdAt: true,
      createdByEmployee: { select: { fullName: true } },
    },
  });

  return link === null
    ? null
    : {
        code: link.code,
        name: link.name,
        medium: link.medium,
        placement: link.placement,
        createdAt: link.createdAt,
        createdBy: link.createdByEmployee?.fullName ?? null,
      };
};

// ---------------------------------------------------------------------------
// Воронка
// ---------------------------------------------------------------------------

/**
 * Общая часть запросов воронки — `WITH` с пятью выборками, определения issue #380.
 *
 * - `touches` — касания без демо: Telegram, хоть раз привязанный к демо-человеку, — отправителем
 *   или чатом, — не считается нигде. Касание пишется и без человека, поэтому демо узнаётся
 *   по привязкам Telegram, а не по `person_id` касания
 * - `first_touches` — первое касание каждого Telegram по каждой метке: «уже были» решается им
 * - `joins` — вступление человека: его первая привязка Telegram; Telegram вступления —
 *   `telegram_user_id`, а у перенесённых из старой базы, где он пуст, — `telegram_chat_id`
 * - `attributed` — вступление, засчитанное метке: последнее касание любой метки с тем же
 *   Telegram до вступления (решение Руслана, T108). Касание после вступления не засчитывается
 * - `first_trips` — первая завершённая поездка засчитанного человека после вступления,
 *   по всем его профилям
 *
 * Вступления без касаний отсекаются до бокового подзапроса: привязок тысячи, касаний — сотни.
 */
const FUNNEL_SQL = Prisma.sql`
  WITH touches AS (
         SELECT touch."id", touch."code", touch."telegram_user_id", touch."was_participant", touch."touched_at"
           FROM xb.promo_touches AS touch
          WHERE NOT EXISTS (
                  SELECT 1
                    FROM xb.telegram_links AS link
                    JOIN xb.persons AS person ON person."id" = link."person_id"
                   WHERE person."is_demo"
                     AND (link."telegram_user_id" = touch."telegram_user_id"
                          OR link."telegram_chat_id" = touch."telegram_chat_id")
                )
       ),
       first_touches AS (
         SELECT DISTINCT ON (touches."code", touches."telegram_user_id")
                touches."code", touches."telegram_user_id", touches."was_participant"
           FROM touches
          ORDER BY touches."code", touches."telegram_user_id", touches."touched_at", touches."id"
       ),
       joins AS (
         SELECT DISTINCT ON (link."person_id")
                link."person_id",
                coalesce(link."telegram_user_id", link."telegram_chat_id") AS "telegram_id",
                link."linked_at" AS "joined_at"
           FROM xb.telegram_links AS link
           JOIN xb.persons AS person ON person."id" = link."person_id"
          WHERE NOT person."is_demo"
          ORDER BY link."person_id", link."linked_at", link."id"
       ),
       attributed AS (
         SELECT joins."person_id", joins."joined_at", last_touch."code", last_touch."touched_at"
           FROM joins
          CROSS JOIN LATERAL (
                  SELECT touches."code", touches."touched_at"
                    FROM touches
                   WHERE touches."telegram_user_id" = joins."telegram_id"
                     AND touches."touched_at" < joins."joined_at"
                   ORDER BY touches."touched_at" DESC, touches."id" DESC
                   LIMIT 1
                ) AS last_touch
          WHERE joins."telegram_id" IN (SELECT touches."telegram_user_id" FROM touches)
       ),
       first_trips AS (
         SELECT attributed."person_id", min(trip."ended_at") AS "first_trip_at"
           FROM attributed
           JOIN xb.park_profiles AS profile ON profile."person_id" = attributed."person_id"
           JOIN xb.trips AS trip ON trip."profile_id" = profile."profile_id"
          WHERE trip."status" = 'complete'
            AND trip."ended_at" > attributed."joined_at"
          GROUP BY attributed."person_id"
       )
`;

export type PromoFunnelRow = {
  code: string;
  name: string;
  medium: PromoMedium;
  placement: string | null;
  createdAt: Date;
  went: number;
  joined: number;
  firstTrip: number;
  already: number;
  touches: number;
};

/** Метки с воронкой за всё время, новые сверху. С `code` — одна эта метка. */
export const listPromoFunnels = async (code?: string): Promise<PromoFunnelRow[]> =>
  db.$queryRaw<PromoFunnelRow[]>`
    ${FUNNEL_SQL},
    went AS (
      SELECT first_touches."code",
             count(*)::int AS "went",
             count(*) FILTER (WHERE first_touches."was_participant")::int AS "already"
        FROM first_touches
       GROUP BY first_touches."code"
    ),
    touched AS (
      SELECT touches."code", count(*)::int AS "touches"
        FROM touches
       GROUP BY touches."code"
    ),
    joined AS (
      SELECT attributed."code",
             count(*)::int AS "joined",
             count(first_trips."person_id")::int AS "first_trip"
        FROM attributed
        LEFT JOIN first_trips ON first_trips."person_id" = attributed."person_id"
       GROUP BY attributed."code"
    )
    SELECT link."code",
           link."name",
           link."medium"::text      AS "medium",
           link."placement",
           link."created_at"        AS "createdAt",
           coalesce(went."went", 0)           AS "went",
           coalesce(joined."joined", 0)       AS "joined",
           coalesce(joined."first_trip", 0)   AS "firstTrip",
           coalesce(went."already", 0)        AS "already",
           coalesce(touched."touches", 0)     AS "touches"
      FROM xb.promo_links AS link
      LEFT JOIN went ON went."code" = link."code"
      LEFT JOIN touched ON touched."code" = link."code"
      LEFT JOIN joined ON joined."code" = link."code"
     WHERE ${code === undefined ? Prisma.sql`TRUE` : Prisma.sql`link."code" = ${code}`}
     ORDER BY link."created_at" DESC, link."code"
  `;

export type PromoTotalsRow = {
  went: number;
  joined: number;
  firstTrip: number;
  already: number;
};

/**
 * Итоги по всем меткам справочника. Перешли и уже были — разные люди по всем меткам вместе:
 * перешедший по двум меткам — один. Вступили и первая поездка — сумма по меткам: вступление
 * засчитано одной метке, и сумма людей не повторяет.
 *
 * Касания кодов, которых в справочнике нет, в итоги не входят: в таблице их строк нет,
 * и итог не сходился бы с колонками.
 */
export const readPromoTotals = async (): Promise<PromoTotalsRow> => {
  const rows = await db.$queryRaw<PromoTotalsRow[]>`
    ${FUNNEL_SQL},
    listed AS (
      SELECT first_touches."telegram_user_id", first_touches."was_participant"
        FROM first_touches
        JOIN xb.promo_links AS link ON link."code" = first_touches."code"
    ),
    counted AS (
      SELECT attributed."person_id", first_trips."person_id" AS "rider_id"
        FROM attributed
        JOIN xb.promo_links AS link ON link."code" = attributed."code"
        LEFT JOIN first_trips ON first_trips."person_id" = attributed."person_id"
    )
    SELECT (SELECT count(DISTINCT listed."telegram_user_id") FROM listed)::int AS "went",
           (SELECT count(*) FROM counted)::int                                    AS "joined",
           (SELECT count(counted."rider_id") FROM counted)::int                   AS "firstTrip",
           (SELECT count(DISTINCT listed."telegram_user_id")
              FROM listed WHERE listed."was_participant")::int                    AS "already"
  `;

  const row = rows[0];

  if (row === undefined) {
    throw new Error('итоги промо-меток не вернули строку');
  }

  return row;
};

export type PromoDayRow = {
  day: string;
  people: number;
};

/**
 * Разные люди по метке за сутки по Ташкенту — с более ранней из двух дат, суток создания метки
 * и суток первого касания, по сутки `now` включительно; сутки без касаний — нулём.
 *
 * Касания раньше создания метки бывают: бот пишет любой годный код, и `p_poster1` висел
 * раньше, чем его завели в справочник (решение Руслана 05-10-2026, `created_at` не трогается).
 */
export const listPromoDays = async (code: string, now: Date): Promise<PromoDayRow[]> =>
  db.$queryRaw<PromoDayRow[]>`
    ${FUNNEL_SQL},
    coded AS (
      SELECT touches."telegram_user_id", ${parkDaySql(Prisma.sql`touches."touched_at"`)} AS "day"
        FROM touches
       WHERE touches."code" = ${code}
    ),
    bounds AS (
      SELECT least(
               ${parkDaySql(Prisma.sql`link."created_at"`)},
               (SELECT min(coded."day") FROM coded)
             ) AS "first_day",
             ${parkDaySql(Prisma.sql`${now}::timestamptz`)} AS "last_day"
        FROM xb.promo_links AS link
       WHERE link."code" = ${code}
    )
    SELECT to_char(series."day", 'YYYY-MM-DD') AS "day",
           count(DISTINCT coded."telegram_user_id")::int AS "people"
      FROM bounds
     CROSS JOIN LATERAL generate_series(bounds."first_day"::timestamp, bounds."last_day"::timestamp, interval '1 day') AS series("day")
      LEFT JOIN coded ON coded."day" = series."day"::date
     GROUP BY series."day"
     ORDER BY series."day"
  `;

export type PromoJoinedRow = {
  personId: string;
  callsign: string | null;
  firstName: string | null;
  lastName: string | null;
  touchedAt: Date;
  joinedAt: Date;
  firstTripAt: Date | null;
};

/**
 * Вступившие по метке, новые сверху. Позывной и имя — из профиля с последней завершённой
 * поездкой человека: у двух учёток в парке это та, на которой он ездит сейчас. Поездок нет —
 * из любого его профиля.
 */
export const listPromoJoined = async (code: string): Promise<PromoJoinedRow[]> =>
  db.$queryRaw<PromoJoinedRow[]>`
    ${FUNNEL_SQL}
    SELECT attributed."person_id"     AS "personId",
           profile."callsign",
           profile."first_name"       AS "firstName",
           profile."last_name"        AS "lastName",
           attributed."touched_at"    AS "touchedAt",
           attributed."joined_at"     AS "joinedAt",
           first_trips."first_trip_at" AS "firstTripAt"
      FROM attributed
      LEFT JOIN first_trips ON first_trips."person_id" = attributed."person_id"
      LEFT JOIN LATERAL (
             SELECT owned."callsign", owned."first_name", owned."last_name"
               FROM xb.park_profiles AS owned
               LEFT JOIN LATERAL (
                      SELECT max(trip."ended_at") AS "ended_at"
                        FROM xb.trips AS trip
                       WHERE trip."profile_id" = owned."profile_id"
                         AND trip."status" = 'complete'
                    ) AS last_trip ON TRUE
              WHERE owned."person_id" = attributed."person_id"
              ORDER BY last_trip."ended_at" DESC NULLS LAST, owned."profile_id"
              LIMIT 1
           ) AS profile ON TRUE
     WHERE attributed."code" = ${code}
     ORDER BY attributed."joined_at" DESC, attributed."person_id"
  `;
