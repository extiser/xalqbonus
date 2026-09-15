import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { MailingRecipientOutcome, MailingStatus } from '#server/generated/prisma/enums';

/**
 * Рассылки и снимок их адресатов.
 *
 * Схема в сыром SQL указывается явно — `xb.mailings`, а не `mailings`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 *
 * Переходы статуса пишутся условием на прежний статус внутри `UPDATE`, а не проверкой
 * перед ним: два нажатия «Запустить» подряд обязаны дать один запуск, и решает это база
 * (docs/principles.md → «Идемпотентность вместо аккуратности»).
 */

type Executor = Prisma.TransactionClient;

export type MailingRow = {
  id: string;
  title: string;
  textRu: string;
  textUz: string | null;
  photoPath: string | null;
  activeWithinDays: number | null;
  status: MailingStatus;
  createdByName: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
  total: number;
  pending: number;
  sent: number;
  skippedDisabled: number;
  invalidChat: number;
  failed: number;
};

/**
 * Рассылка со счётчиками исходов. Счётчики считаются по снимку в том же запросе, а не лежат
 * колонками: число, накопленное по дороге, однажды разойдётся с построчным журналом.
 */
const MAILING_SELECT = Prisma.sql`
  SELECT mailing."id",
         mailing."title",
         mailing."text_ru"            AS "textRu",
         mailing."text_uz"            AS "textUz",
         mailing."photo_path"         AS "photoPath",
         mailing."active_within_days" AS "activeWithinDays",
         mailing."status",
         author."full_name"           AS "createdByName",
         mailing."created_at"         AS "createdAt",
         mailing."started_at"         AS "startedAt",
         mailing."finished_at"        AS "finishedAt",
         mailing."updated_at"         AS "updatedAt",
         COALESCE(counters."total", 0)            AS "total",
         COALESCE(counters."pending", 0)          AS "pending",
         COALESCE(counters."sent", 0)             AS "sent",
         COALESCE(counters."skippedDisabled", 0)  AS "skippedDisabled",
         COALESCE(counters."invalidChat", 0)      AS "invalidChat",
         COALESCE(counters."failed", 0)           AS "failed"
    FROM xb.mailings AS mailing
    JOIN xb.employees AS author ON author."id" = mailing."created_by_id"
    LEFT JOIN LATERAL (
         SELECT count(*)::int                                                 AS "total",
                count(*) FILTER (WHERE recipient."outcome" = 'pending')::int          AS "pending",
                count(*) FILTER (WHERE recipient."outcome" = 'sent')::int             AS "sent",
                count(*) FILTER (WHERE recipient."outcome" = 'skipped_disabled')::int AS "skippedDisabled",
                count(*) FILTER (WHERE recipient."outcome" = 'invalid_chat')::int     AS "invalidChat",
                count(*) FILTER (WHERE recipient."outcome" = 'failed')::int           AS "failed"
           FROM xb.mailing_recipients AS recipient
          WHERE recipient."mailing_id" = mailing."id"
    ) AS counters ON true
`;

/** Все рассылки, свежие первыми. Их единицы и десятки, страниц не нужно. */
export const listMailings = async (client: Executor = db): Promise<MailingRow[]> =>
  client.$queryRaw<MailingRow[]>`
    ${MAILING_SELECT}
     ORDER BY mailing."created_at" DESC
  `;

export const findMailing = async (
  mailingId: string,
  client: Executor = db,
): Promise<MailingRow | null> => {
  const rows = await client.$queryRaw<MailingRow[]>`
    ${MAILING_SELECT}
     WHERE mailing."id" = ${mailingId}::uuid
  `;

  return rows[0] ?? null;
};

export type MailingFieldsInput = {
  title: string;
  textRu: string;
  textUz: string | null;
  activeWithinDays: number | null;
};

export type InsertMailingInput = MailingFieldsInput & {
  photoPath: string | null;
  createdById: string;
};

/** Заводит черновик. Возвращает идентификатор: полную строку со счётчиками читает сервис. */
export const insertDraftMailing = async (
  input: InsertMailingInput,
  client: Executor = db,
): Promise<string> => {
  const rows = await client.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.mailings (
      "title", "text_ru", "text_uz", "photo_path", "active_within_days", "status", "created_by_id"
    )
    VALUES (
      ${input.title},
      ${input.textRu},
      ${input.textUz},
      ${input.photoPath},
      ${input.activeWithinDays}::int,
      'draft'::xb.mailing_status,
      ${input.createdById}::uuid
    )
    RETURNING "id"
  `;

  const row = rows[0];

  if (!row) {
    throw new Error('вставка рассылки не вернула строку');
  }

  return row.id;
};

/** Правка черновика. `false` — строки нет или она уже не черновик: запущенную не правят. */
export const updateDraftMailing = async (
  mailingId: string,
  input: MailingFieldsInput,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.mailings
       SET "title"              = ${input.title},
           "text_ru"            = ${input.textRu},
           "text_uz"            = ${input.textUz},
           "active_within_days" = ${input.activeWithinDays}::int,
           "updated_at"         = now()
     WHERE "id" = ${mailingId}::uuid
       AND "status" = 'draft'
  `;

  return updated > 0;
};

/**
 * Путь фото черновика. Двигает `updated_at`: он версия адреса картинки, и перезалитое фото
 * того же формата иначе осталось бы в кэше браузера.
 */
export const updateDraftMailingPhotoPath = async (
  mailingId: string,
  photoPath: string,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.mailings
       SET "photo_path" = ${photoPath},
           "updated_at" = now()
     WHERE "id" = ${mailingId}::uuid
       AND "status" = 'draft'
  `;

  return updated > 0;
};

/**
 * Снимает фото с черновика. `false` — строки нет или она уже не черновик: у запущенной
 * фото уходит адресатам, и снять его на середине значило бы разослать две разные рассылки.
 */
export const clearDraftMailingPhotoPath = async (
  mailingId: string,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.mailings
       SET "photo_path" = NULL,
           "updated_at" = now()
     WHERE "id" = ${mailingId}::uuid
       AND "status" = 'draft'
  `;

  return updated > 0;
};

/**
 * Участники программы, которых возьмёт рассылка: строка `person_settings` и активная
 * привязка Telegram. С фильтром — ещё и завершённая поездка за последние N дней на любом
 * профиле человека.
 *
 * Поездка берётся завершённая: «ездил» — это довёз, а отменённый заказ тоже несёт
 * `ended_at`. Человек через профиль, а не колонкой в поездке: у одного человека профилей
 * бывает несколько (docs/decisions.md → «Личность водителя — номер удостоверения»).
 *
 * Один и тот же отбор нужен подсчёту на экране и снимку при запуске — поэтому он собран
 * один раз: разойдись они, экран обещал бы одно число, а в снимок ложилось бы другое.
 */
const COMPLETED_STATUS = 'complete';

const audienceSql = (activeWithinDays: number | null): Prisma.Sql => Prisma.sql`
  SELECT settings."person_id",
         settings."notifications_enabled"
    FROM xb.person_settings AS settings
    JOIN xb.telegram_links AS link
      ON link."person_id" = settings."person_id"
     AND link."closed_at" IS NULL
   WHERE ${activeWithinDays}::int IS NULL
      OR EXISTS (
           SELECT 1
             FROM xb.park_profiles AS profile
             JOIN xb.trips AS trip ON trip."profile_id" = profile."profile_id"
            WHERE profile."person_id" = settings."person_id"
              AND trip."status" = ${COMPLETED_STATUS}
              AND trip."ended_at" >= now() - make_interval(days => ${activeWithinDays}::int)
         )
`;

export type AudienceCountRow = { total: number; notificationsDisabled: number };

export const countMailingAudience = async (
  activeWithinDays: number | null,
  client: Executor = db,
): Promise<AudienceCountRow> => {
  const rows = await client.$queryRaw<AudienceCountRow[]>`
    SELECT count(*)::int                                           AS "total",
           count(*) FILTER (WHERE NOT audience."notifications_enabled")::int AS "notificationsDisabled"
      FROM (${audienceSql(activeWithinDays)}) AS audience
  `;

  return rows[0] ?? { total: 0, notificationsDisabled: 0 };
};

/**
 * Черновик → идёт. Возвращает фильтр рассылки, по которому снимается снимок; `null` —
 * строки нет или она уже не черновик, и снимать нечего.
 */
export const markMailingRunning = async (
  mailingId: string,
  client: Executor = db,
): Promise<{ activeWithinDays: number | null } | null> => {
  const rows = await client.$queryRaw<{ activeWithinDays: number | null }[]>`
    UPDATE xb.mailings
       SET "status"     = 'running'::xb.mailing_status,
           "started_at" = now(),
           "updated_at" = now()
     WHERE "id" = ${mailingId}::uuid
       AND "status" = 'draft'
    RETURNING "active_within_days" AS "activeWithinDays"
  `;

  return rows[0] ?? null;
};

/**
 * Снимок адресатов. Выключившие уведомления ложатся сразу исходом `skipped_disabled`,
 * остальные — `pending`. Повтор второй строки не заводит: пара — первичный ключ.
 */
export const insertMailingRecipients = async (
  mailingId: string,
  activeWithinDays: number | null,
  client: Executor = db,
): Promise<number> =>
  client.$executeRaw`
    INSERT INTO xb.mailing_recipients ("mailing_id", "person_id", "outcome", "outcome_at")
    SELECT ${mailingId}::uuid,
           audience."person_id",
           CASE WHEN audience."notifications_enabled"
                THEN 'pending'::xb.mailing_recipient_outcome
                ELSE 'skipped_disabled'::xb.mailing_recipient_outcome
           END,
           CASE WHEN audience."notifications_enabled" THEN NULL ELSE now() END
      FROM (${audienceSql(activeWithinDays)}) AS audience
    ON CONFLICT ("mailing_id", "person_id") DO NOTHING
  `;

/** Кому ещё не отправлено — по ним ставятся и снимаются задания очереди. */
export const listPendingRecipientIds = async (
  mailingId: string,
  client: Executor = db,
): Promise<string[]> => {
  const rows = await client.$queryRaw<{ personId: string }[]>`
    SELECT "person_id" AS "personId"
      FROM xb.mailing_recipients
     WHERE "mailing_id" = ${mailingId}::uuid
       AND "outcome" = 'pending'
     ORDER BY "person_id"
  `;

  return rows.map((row) => row.personId);
};

/** Идёт → остановлена. `false` — строки нет или она не идёт. */
export const markMailingStopped = async (
  mailingId: string,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.mailings
       SET "status"      = 'stopped'::xb.mailing_status,
           "finished_at" = now(),
           "updated_at"  = now()
     WHERE "id" = ${mailingId}::uuid
       AND "status" = 'running'
  `;

  return updated > 0;
};

/**
 * Идёт → завершена, если ждущих адресатов не осталось. Условие целиком в запросе: исходы
 * пишут несколько заданий разом, и проверка «последний ли» в коде была бы гонкой.
 */
export const finishMailingIfDone = async (
  mailingId: string,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.mailings AS mailing
       SET "status"      = 'finished'::xb.mailing_status,
           "finished_at" = now(),
           "updated_at"  = now()
     WHERE mailing."id" = ${mailingId}::uuid
       AND mailing."status" = 'running'
       AND NOT EXISTS (
             SELECT 1 FROM xb.mailing_recipients AS recipient
              WHERE recipient."mailing_id" = mailing."id"
                AND recipient."outcome" = 'pending'
           )
  `;

  return updated > 0;
};

/** Текст и фото рассылки и её статус — то, что отправка читает перед каждым адресатом. */
export type MailingDeliveryRow = {
  status: MailingStatus;
  textRu: string;
  textUz: string | null;
  photoPath: string | null;
  /** Исход этого адресата. `null` — в снимке его нет. */
  outcome: MailingRecipientOutcome | null;
  /** Куда писать: активная привязка на момент отправки. `null` — привязки нет. */
  telegramChatId: bigint | null;
  /** Выключатель уведомлений. `null` — строки участия нет: человек вне программы. */
  notificationsEnabled: boolean | null;
};

/**
 * Всё, что отправке нужно про рассылку и одного адресата, одним запросом: статус, тексты,
 * исход в снимке и канал связи на сейчас.
 *
 * Канал читается в момент отправки, а не берётся из снимка: за минуты очереди человек
 * успевает и выключить уведомления, и потерять привязку.
 *
 * Языка здесь нет: рассылка уходит на обоих языках сразу (`shared/mailing.ts`).
 */
export const findMailingDelivery = async (
  mailingId: string,
  personId: string,
  client: Executor = db,
): Promise<MailingDeliveryRow | null> => {
  const rows = await client.$queryRaw<MailingDeliveryRow[]>`
    SELECT mailing."status",
           mailing."text_ru"                AS "textRu",
           mailing."text_uz"                AS "textUz",
           mailing."photo_path"             AS "photoPath",
           recipient."outcome",
           link."telegram_chat_id"          AS "telegramChatId",
           settings."notifications_enabled" AS "notificationsEnabled"
      FROM xb.mailings AS mailing
      LEFT JOIN xb.mailing_recipients AS recipient
        ON recipient."mailing_id" = mailing."id"
       AND recipient."person_id" = ${personId}::uuid
      LEFT JOIN xb.person_settings AS settings
        ON settings."person_id" = ${personId}::uuid
      LEFT JOIN xb.telegram_links AS link
        ON link."person_id" = ${personId}::uuid
       AND link."closed_at" IS NULL
     WHERE mailing."id" = ${mailingId}::uuid
  `;

  return rows[0] ?? null;
};

/**
 * Исход адресата. У `sent` — обязательно с `message_id` от Telegram, у прочих его нет:
 * тип не даёт записать одно без другого, а в базе то же держит проверка.
 */
export type RecipientOutcomeRecord =
  | { outcome: 'sent'; messageId: number }
  | { outcome: Exclude<MailingRecipientOutcome, 'pending' | 'sent'> };

/**
 * Записывает исход адресата. Только поверх `pending`: повтор задания, пришедший после
 * записанного исхода, не переписывает его. `false` — исход уже был.
 */
export const recordRecipientOutcome = async (
  mailingId: string,
  personId: string,
  record: RecipientOutcomeRecord,
  client: Executor = db,
): Promise<boolean> => {
  const messageId = record.outcome === 'sent' ? record.messageId : null;

  const updated = await client.$executeRaw`
    UPDATE xb.mailing_recipients
       SET "outcome"    = ${record.outcome}::xb.mailing_recipient_outcome,
           "outcome_at" = now(),
           "message_id" = ${messageId}::bigint
     WHERE "mailing_id" = ${mailingId}::uuid
       AND "person_id" = ${personId}::uuid
       AND "outcome" = 'pending'
  `;

  return updated > 0;
};
