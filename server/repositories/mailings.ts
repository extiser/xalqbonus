import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { MailingRecipientOutcome, MailingStatus } from '#server/generated/prisma/enums';
// Относительным путём, а не через `#shared`: модуль собирается в воркер, а бандл воркера
// знает только псевдоним `#server` (package.json → build:worker).
import { MAILING_RECALL_WINDOW_HOURS } from '../../shared/mailing';

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
  /** Пусто только у черновика — проверкой `mailings_texts_check`. */
  title: string | null;
  /** Пусто только у черновика. */
  textRu: string | null;
  textUz: string | null;
  photoPath: string | null;
  status: MailingStatus;
  /** Демо-рассылка (issue #212): уходит только демо-водителям. */
  isDemo: boolean;
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
  recallStartedAt: Date | null;
  recallFinishedAt: Date | null;
  /** Сколько отправленных сообщений снято отзывом. Среди `sent`, а не рядом: исход прежний. */
  recalled: number;
  /** Самое раннее отправленное плюс окно Telegram. Пусто — не отправлено ничего. */
  recallDeadlineAt: Date | null;
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
         mailing."status",
         mailing."is_demo"            AS "isDemo",
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
         COALESCE(counters."failed", 0)           AS "failed",
         mailing."recall_started_at"  AS "recallStartedAt",
         mailing."recall_finished_at" AS "recallFinishedAt",
         COALESCE(counters."recalled", 0)         AS "recalled",
         counters."firstSentAt" + make_interval(hours => ${MAILING_RECALL_WINDOW_HOURS}::int)
                                      AS "recallDeadlineAt"
    FROM xb.mailings AS mailing
    JOIN xb.employees AS author ON author."id" = mailing."created_by_id"
    LEFT JOIN LATERAL (
         SELECT count(*)::int                                                 AS "total",
                count(*) FILTER (WHERE recipient."outcome" = 'pending')::int          AS "pending",
                count(*) FILTER (WHERE recipient."outcome" = 'sent')::int             AS "sent",
                count(*) FILTER (WHERE recipient."outcome" = 'skipped_disabled')::int AS "skippedDisabled",
                count(*) FILTER (WHERE recipient."outcome" = 'invalid_chat')::int     AS "invalidChat",
                count(*) FILTER (WHERE recipient."outcome" = 'failed')::int           AS "failed",
                count(*) FILTER (WHERE recipient."recalled_at" IS NOT NULL)::int      AS "recalled",
                min(recipient."outcome_at") FILTER (WHERE recipient."outcome" = 'sent') AS "firstSentAt"
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
  title: string | null;
  textRu: string | null;
  textUz: string | null;
};

export type InsertMailingInput = MailingFieldsInput & {
  photoPath: string | null;
  createdById: string;
  /** Признак демо ставится только здесь: правка его не трогает (issue #212). */
  isDemo: boolean;
};

/** Заводит черновик. Возвращает идентификатор: полную строку со счётчиками читает сервис. */
export const insertDraftMailing = async (
  input: InsertMailingInput,
  client: Executor = db,
): Promise<string> => {
  const rows = await client.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.mailings (
      "title", "text_ru", "text_uz", "photo_path", "status", "created_by_id", "is_demo"
    )
    VALUES (
      ${input.title},
      ${input.textRu},
      ${input.textUz},
      ${input.photoPath},
      'draft'::xb.mailing_status,
      ${input.createdById}::uuid,
      ${input.isDemo}
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
       SET "title"      = ${input.title},
           "text_ru"    = ${input.textRu},
           "text_uz"    = ${input.textUz},
           "updated_at" = now()
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
 * Удаляет черновик физически и возвращает путь его фото, чтобы сервис снял файл с тома.
 * `null` — строки нет или она уже не черновик.
 *
 * Условие «ещё черновик» стоит в самом `DELETE`: между нажатием «Удалить» и записью рассылку
 * мог запустить второй сотрудник, и тогда удалять нельзя — снимок уже ссылается на неё.
 * У черновика снимка нет по построению, поэтому строк адресатов здесь не трогаем.
 */
export const deleteDraftMailing = async (
  mailingId: string,
  client: Executor = db,
): Promise<{ photoPath: string | null } | null> => {
  const rows = await client.$queryRaw<{ photoPath: string | null }[]>`
    DELETE FROM xb.mailings
     WHERE "id" = ${mailingId}::uuid
       AND "status" = 'draft'
    RETURNING "photo_path" AS "photoPath"
  `;

  return rows[0] ?? null;
};

/**
 * Участники программы, которых возьмёт рассылка: строка `person_settings` и активная
 * привязка Telegram. Все до одного — фильтров нет: резать аудиторию не на чем, пока нет
 * дашборда (решение Руслана 15-09-2026, issue #136).
 *
 * Один и тот же отбор нужен подсчёту на экране и снимку при запуске — поэтому он собран
 * один раз: разойдись они, экран обещал бы одно число, а в снимок ложилось бы другое.
 *
 * Признак рассылки (issue #212): у демо-рассылки аудитория — только демо-водители, у живой —
 * все участники, демо-водители тоже: живое до демо доходит, демо до живого — нет.
 */
const audienceSql = (isDemo: boolean): Prisma.Sql => Prisma.sql`
  SELECT settings."person_id",
         settings."notifications_enabled"
    FROM xb.person_settings AS settings
    JOIN xb.telegram_links AS link
      ON link."person_id" = settings."person_id"
     AND link."closed_at" IS NULL
    JOIN xb.persons AS person
      ON person."id" = settings."person_id"
   WHERE (NOT ${isDemo}::boolean OR person."is_demo")
`;

export type AudienceCountRow = { total: number; notificationsDisabled: number };

export const countMailingAudience = async (
  isDemo: boolean,
  client: Executor = db,
): Promise<AudienceCountRow> => {
  const rows = await client.$queryRaw<AudienceCountRow[]>`
    SELECT count(*)::int                                           AS "total",
           count(*) FILTER (WHERE NOT audience."notifications_enabled")::int AS "notificationsDisabled"
      FROM (${audienceSql(isDemo)}) AS audience
  `;

  return rows[0] ?? { total: 0, notificationsDisabled: 0 };
};

/** Черновик → идёт. `false` — строки нет или она уже не черновик, и снимать снимок нечего. */
export const markMailingRunning = async (
  mailingId: string,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.mailings
       SET "status"     = 'running'::xb.mailing_status,
           "started_at" = now(),
           "updated_at" = now()
     WHERE "id" = ${mailingId}::uuid
       AND "status" = 'draft'
  `;

  return updated > 0;
};

/**
 * Снимок адресатов. Выключившие уведомления ложатся сразу исходом `skipped_disabled`,
 * остальные — `pending`. Повтор второй строки не заводит: пара — первичный ключ.
 *
 * `isDemo` — признак самой рассылки: он не меняется после заведения, и прочитанный запуском
 * верен и здесь.
 */
export const insertMailingRecipients = async (
  mailingId: string,
  isDemo: boolean,
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
      FROM (${audienceSql(isDemo)}) AS audience
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
  /** Пусто только у черновика, а черновик не отправляется. */
  textRu: string | null;
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

/**
 * Отмечает запуск отзыва. `false` — строки нет, она не остановлена и не завершена, отзыв уже
 * запускали, не отправлено ни одного сообщения или окно Telegram от самого раннего
 * отправленного истекло. Какая из причин — разбирает сервис.
 *
 * Все условия в одном `UPDATE`: два нажатия «Отозвать» подряд обязаны дать один отзыв,
 * и решает это база, а не проверка перед записью.
 */
export const markMailingRecallStarted = async (
  mailingId: string,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.mailings AS mailing
       SET "recall_started_at" = now(),
           "updated_at"        = now()
     WHERE mailing."id" = ${mailingId}::uuid
       AND mailing."status" IN ('stopped', 'finished')
       AND mailing."recall_started_at" IS NULL
       AND (
             SELECT min(recipient."outcome_at")
               FROM xb.mailing_recipients AS recipient
              WHERE recipient."mailing_id" = mailing."id"
                AND recipient."outcome" = 'sent'
           ) > now() - make_interval(hours => ${MAILING_RECALL_WINDOW_HOURS}::int)
  `;

  return updated > 0;
};

/**
 * Снимает отметку запуска отзыва, если задания поставить не удалось: иначе кнопка погасла бы
 * навсегда при отзыве, который не начинался. Только пока ни одного сообщения не снято.
 */
export const clearMailingRecallStarted = async (
  mailingId: string,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.mailings AS mailing
       SET "recall_started_at" = NULL,
           "updated_at"        = now()
     WHERE mailing."id" = ${mailingId}::uuid
       AND mailing."recall_finished_at" IS NULL
       AND NOT EXISTS (
             SELECT 1 FROM xb.mailing_recipients AS recipient
              WHERE recipient."mailing_id" = mailing."id"
                AND recipient."recalled_at" IS NOT NULL
           )
  `;

  return updated > 0;
};

/** Кому отзыв ставит задания: дошедшие и ещё не снятые. */
export const listRecallableRecipientIds = async (
  mailingId: string,
  client: Executor = db,
): Promise<string[]> => {
  const rows = await client.$queryRaw<{ personId: string }[]>`
    SELECT "person_id" AS "personId"
      FROM xb.mailing_recipients
     WHERE "mailing_id" = ${mailingId}::uuid
       AND "outcome" = 'sent'
       AND "recalled_at" IS NULL
     ORDER BY "person_id"
  `;

  return rows.map((row) => row.personId);
};

/** Всё, что отзыву нужно про одного адресата. */
export type MailingRecallTargetRow = {
  recallStartedAt: Date | null;
  outcome: MailingRecipientOutcome;
  messageId: bigint | null;
  recalledAt: Date | null;
  /**
   * Чат, куда ушло сообщение: привязка, активная в момент отправки, даже если она с тех пор
   * закрыта. `null` — такой привязки не нашлось.
   */
  telegramChatId: bigint | null;
};

/**
 * Адресат отзыва одним запросом. `null` — рассылки нет или человека нет в её снимке.
 *
 * Чат берётся не активный сейчас, а тот, что был активен при отправке: `message_id` имеет
 * смысл только в своём чате, а человек за двое суток мог перепривязаться на другой Telegram.
 */
export const findMailingRecallTarget = async (
  mailingId: string,
  personId: string,
  client: Executor = db,
): Promise<MailingRecallTargetRow | null> => {
  const rows = await client.$queryRaw<MailingRecallTargetRow[]>`
    SELECT mailing."recall_started_at" AS "recallStartedAt",
           recipient."outcome",
           recipient."message_id"      AS "messageId",
           recipient."recalled_at"     AS "recalledAt",
           link."telegram_chat_id"     AS "telegramChatId"
      FROM xb.mailings AS mailing
      JOIN xb.mailing_recipients AS recipient
        ON recipient."mailing_id" = mailing."id"
       AND recipient."person_id" = ${personId}::uuid
      LEFT JOIN LATERAL (
           SELECT candidate."telegram_chat_id"
             FROM xb.telegram_links AS candidate
            WHERE candidate."person_id" = recipient."person_id"
              AND candidate."linked_at" <= recipient."outcome_at"
              AND (candidate."closed_at" IS NULL OR candidate."closed_at" >= recipient."outcome_at")
            ORDER BY candidate."linked_at" DESC
            LIMIT 1
      ) AS link ON true
     WHERE mailing."id" = ${mailingId}::uuid
  `;

  return rows[0] ?? null;
};

/** Отмечает снятое сообщение. `false` — уже снято раньше: повтор задания ничего не пишет. */
export const markRecipientRecalled = async (
  mailingId: string,
  personId: string,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.mailing_recipients
       SET "recalled_at" = now()
     WHERE "mailing_id" = ${mailingId}::uuid
       AND "person_id" = ${personId}::uuid
       AND "outcome" = 'sent'
       AND "recalled_at" IS NULL
  `;

  return updated > 0;
};

/** Отзыв прошёл всех адресатов. `false` — не запускался или уже отмечен завершённым. */
export const markMailingRecallFinished = async (
  mailingId: string,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.mailings
       SET "recall_finished_at" = now(),
           "updated_at"         = now()
     WHERE "id" = ${mailingId}::uuid
       AND "recall_started_at" IS NOT NULL
       AND "recall_finished_at" IS NULL
  `;

  return updated > 0;
};
