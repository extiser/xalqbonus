import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import type { Language, LinkCloseReason, LinkConfirmedBy } from '#server/generated/prisma/enums';

/**
 * Участие в программе: настройки участника и привязки Telegram.
 *
 * Граница «известен парку / в программе» проходит по наличию строки `person_settings`,
 * а не по договорённости (docs/drivers.md). Реестр парка живёт без неё.
 *
 * Записи принимают клиент транзакции параметром. Причина одна и не стилистическая:
 * при регистрации в боте привязка, участие и водительский счёт обязаны лечь одной
 * транзакцией — частичный результат означает человека, который в программе, но без канала,
 * и разбираться с этим придётся руками. Перенос из старой базы зовёт те же функции без
 * параметра и работает как работал: внутри транзакции читать и писать глобальным клиентом
 * нельзя — это другое соединение, и собственных незафиксированных строк оно не видит.
 */

const CHUNK_SIZE = 1_000;

/**
 * Кто исполняет запрос: глобальный клиент или клиент транзакции.
 *
 * `PrismaClient` подходит под `TransactionClient` структурно — у него есть всё то же
 * и сверх того, — поэтому умолчанием стоит `db` и вызывающему коду думать не о чем.
 */
type Executor = Prisma.TransactionClient;

export type PersonSettingsInput = {
  personId: string;
  language: Language;
  joinedAt: Date;
};

/**
 * Заводит настройки участника. Повторный прогон обновляет строку по человеку:
 * второй записи «участия» у одного человека не бывает — `person_id` здесь первичный ключ.
 */
export const upsertPersonSettings = async (
  settings: readonly PersonSettingsInput[],
  joinedSource: string,
  client: Executor = db,
): Promise<void> => {
  for (let offset = 0; offset < settings.length; offset += CHUNK_SIZE) {
    const chunk = settings.slice(offset, offset + CHUNK_SIZE);

    await client.$executeRaw`
      INSERT INTO xb.person_settings ("person_id", "language", "joined_at", "joined_source")
      SELECT * FROM unnest(
        ${chunk.map((row) => row.personId)}::text[]::uuid[],
        ${chunk.map((row) => row.language)}::text[]::xb.language[],
        ${chunk.map((row) => row.joinedAt.toISOString())}::text[]::timestamptz[],
        ${chunk.map(() => joinedSource)}::text[]
      )
      ON CONFLICT ("person_id") DO UPDATE SET
        "language"      = EXCLUDED."language",
        "joined_at"     = EXCLUDED."joined_at",
        "joined_source" = EXCLUDED."joined_source"
    `;
  }
};

export type TelegramLinkInput = {
  personId: string;
  telegramChatId: bigint;
  /**
   * Отправитель, чей контакт подтвердил номер. Пуст у перенесённых из старой базы:
   * там от Telegram сохранился один лишь `chat_id`.
   */
  telegramUserId?: bigint | null;
  /**
   * Закрытая привязка заводится сразу закрытой — так переносятся обе половины двойника,
   * у которых активной не делается ни одна: выбор канала связи принадлежит ответу самого
   * водителя, а не эвристике переноса (docs/drivers.md).
   */
  closedAt: Date | null;
  closeReason: LinkCloseReason | null;
};

/**
 * Кладёт привязки Telegram.
 *
 * Идемпотентность закрытых строк ограничением не выражается: частичные уникальные индексы
 * стоят только на активных привязках, а закрытая история их не касается — она и должна
 * копиться. Поэтому повтор здесь отсекается условием «этой пары человек+чат ещё нет
 * ни в каком виде»: одну и ту же перенесённую привязку второй раз завести не за чем.
 */
export const insertTelegramLinks = async (
  links: readonly TelegramLinkInput[],
  confirmedBy: LinkConfirmedBy,
  client: Executor = db,
): Promise<number> => {
  let written = 0;

  for (let offset = 0; offset < links.length; offset += CHUNK_SIZE) {
    const chunk = links.slice(offset, offset + CHUNK_SIZE);

    written += await client.$executeRaw`
      INSERT INTO xb.telegram_links (
        "person_id", "telegram_chat_id", "telegram_user_id",
        "closed_at", "close_reason", "confirmed_by"
      )
      SELECT incoming.*
        FROM unnest(
               ${chunk.map((link) => link.personId)}::text[]::uuid[],
               ${chunk.map((link) => link.telegramChatId.toString())}::text[]::bigint[],
               ${chunk.map((link) => link.telegramUserId?.toString() ?? null)}::text[]::bigint[],
               ${chunk.map((link) => link.closedAt?.toISOString() ?? null)}::text[]::timestamptz[],
               ${chunk.map((link) => link.closeReason)}::text[]::xb.link_close_reason[],
               ${chunk.map(() => confirmedBy)}::text[]::xb.link_confirmed_by[]
             ) AS incoming(
               "person_id", "telegram_chat_id", "telegram_user_id",
               "closed_at", "close_reason", "confirmed_by"
             )
       WHERE NOT EXISTS (
             SELECT 1 FROM xb.telegram_links AS existing
              WHERE existing."person_id" = incoming."person_id"
                AND existing."telegram_chat_id" = incoming."telegram_chat_id"
       )
    `;
  }

  return written;
};

export type ActiveTelegramLinkRow = {
  personId: string;
  telegramChatId: bigint;
};

/**
 * Активная привязка этого чата. Пусто — этот Telegram сейчас ничей.
 *
 * С неё начинается каждый `/start`: привязка есть — водитель уже участник, и телефон
 * у него второй раз не спрашивают.
 */
export const findActiveLinkByChat = async (
  telegramChatId: bigint,
): Promise<ActiveTelegramLinkRow | null> => {
  const rows = await db.$queryRaw<ActiveTelegramLinkRow[]>`
    SELECT "person_id"        AS "personId",
           "telegram_chat_id" AS "telegramChatId"
      FROM xb.telegram_links
     WHERE "closed_at" IS NULL
       AND "telegram_chat_id" = ${telegramChatId.toString()}::text::bigint
  `;

  return rows[0] ?? null;
};

/**
 * Активная привязка этого человека. Пусто — он ещё не в программе или его канал закрыт.
 *
 * Читается при регистрации ради одного: у человека с активной привязкой автопривязки
 * не бывает **ни при каких совпадениях телефона**. Перепривязка — операция оператора,
 * с уведомлением на прежний чат (docs/drivers.md → «Перепривязка — операция, а не
 * побочный эффект»).
 */
export const findActiveLinkByPerson = async (
  personId: string,
): Promise<ActiveTelegramLinkRow | null> => {
  const rows = await db.$queryRaw<ActiveTelegramLinkRow[]>`
    SELECT "person_id"        AS "personId",
           "telegram_chat_id" AS "telegramChatId"
      FROM xb.telegram_links
     WHERE "closed_at" IS NULL
       AND "person_id" = ${personId}::uuid
  `;

  return rows[0] ?? null;
};

export type TelegramLinkCounts = { active: number; closed: number };

export const countTelegramLinks = async (): Promise<TelegramLinkCounts> => {
  const rows = await db.$queryRaw<{ active: bigint; closed: bigint }[]>`
    SELECT COUNT(*) FILTER (WHERE "closed_at" IS NULL)     AS active,
           COUNT(*) FILTER (WHERE "closed_at" IS NOT NULL) AS closed
      FROM xb.telegram_links
  `;

  return { active: Number(rows[0]?.active ?? 0n), closed: Number(rows[0]?.closed ?? 0n) };
};

/**
 * Разрез привязок по способу подтверждения.
 *
 * Строка отчёта, ради которой запрос и написан: она показывает, что перенесённые
 * привязки лежат под `legacy_import`, а не под `operator` — то есть система не
 * утверждает, что 4 091 привязку проверил человек в офисе.
 */
export const countByConfirmedBy = async (): Promise<Map<LinkConfirmedBy, number>> => {
  const rows = await db.$queryRaw<{ confirmedBy: LinkConfirmedBy; total: bigint }[]>`
    SELECT "confirmed_by" AS "confirmedBy", COUNT(*) AS total
      FROM xb.telegram_links
     GROUP BY "confirmed_by"
     ORDER BY "confirmed_by"
  `;

  return new Map(rows.map((row) => [row.confirmedBy, Number(row.total)]));
};

export type NotificationRecipientRow = {
  /** Привязка, в которую пойдёт сообщение. По ней же она и закрывается, если чат умер. */
  linkId: string;
  telegramChatId: bigint;
  language: Language;
  notificationsEnabled: boolean;
};

/**
 * Куда и на каком языке писать человеку. Пусто — писать некуда.
 *
 * Соединение внутреннее: строка участия без привязки и привязка без строки участия —
 * оба случая означают одно и то же, человека вне программы, и разделять их отправке
 * уведомления незачем.
 *
 * Язык и выключатель уведомлений читаются здесь же, в момент отправки, а не при постановке
 * задания: между постановкой и отправкой проходит время, и человек за это время успевает
 * и сменить язык, и выключить уведомления.
 */
export const findNotificationRecipient = async (
  personId: string,
): Promise<NotificationRecipientRow | null> => {
  const rows = await db.$queryRaw<NotificationRecipientRow[]>`
    SELECT link."id"               AS "linkId",
           link."telegram_chat_id" AS "telegramChatId",
           settings."language",
           settings."notifications_enabled" AS "notificationsEnabled"
      FROM xb.telegram_links AS link
      JOIN xb.person_settings AS settings ON settings."person_id" = link."person_id"
     WHERE link."closed_at" IS NULL
       AND link."person_id" = ${personId}::uuid
  `;

  return rows[0] ?? null;
};

/**
 * Закрывает привязку. Возвращает `false`, если закрывать было нечего: пока задание лежало
 * в очереди, привязку мог закрыть оператор или перепривязка.
 *
 * Закрытие идёт по самой привязке, а не по человеку: за время между чтением получателя
 * и отказом Telegram активной у человека могла стать уже другая, и закрывать её из-за
 * отказа по прежнему чату нельзя.
 */
export const closeTelegramLink = async (
  linkId: string,
  closeReason: LinkCloseReason,
  closedAt: Date,
): Promise<boolean> => {
  const updated = await db.$executeRaw`
    UPDATE xb.telegram_links
       SET "closed_at"    = ${closedAt.toISOString()}::text::timestamptz,
           "close_reason" = ${closeReason}::text::xb.link_close_reason
     WHERE "id" = ${linkId}::uuid
       AND "closed_at" IS NULL
  `;

  return updated > 0;
};
