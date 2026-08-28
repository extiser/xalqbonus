import { db } from '#server/db';
import type { Language, LinkCloseReason, LinkConfirmedBy } from '#server/generated/prisma/enums';

/**
 * Участие в программе: настройки участника и привязки Telegram.
 *
 * Граница «известен парку / в программе» проходит по наличию строки `person_settings`,
 * а не по договорённости (docs/drivers.md). Реестр парка живёт без неё.
 */

const CHUNK_SIZE = 1_000;

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
): Promise<void> => {
  for (let offset = 0; offset < settings.length; offset += CHUNK_SIZE) {
    const chunk = settings.slice(offset, offset + CHUNK_SIZE);

    await db.$executeRaw`
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
): Promise<number> => {
  let written = 0;

  for (let offset = 0; offset < links.length; offset += CHUNK_SIZE) {
    const chunk = links.slice(offset, offset + CHUNK_SIZE);

    written += await db.$executeRaw`
      INSERT INTO xb.telegram_links (
        "person_id", "telegram_chat_id", "closed_at", "close_reason", "confirmed_by"
      )
      SELECT incoming.*
        FROM unnest(
               ${chunk.map((link) => link.personId)}::text[]::uuid[],
               ${chunk.map((link) => link.telegramChatId.toString())}::text[]::bigint[],
               ${chunk.map((link) => link.closedAt?.toISOString() ?? null)}::text[]::timestamptz[],
               ${chunk.map((link) => link.closeReason)}::text[]::xb.link_close_reason[],
               ${chunk.map(() => confirmedBy)}::text[]::xb.link_confirmed_by[]
             ) AS incoming("person_id", "telegram_chat_id", "closed_at", "close_reason", "confirmed_by")
       WHERE NOT EXISTS (
             SELECT 1 FROM xb.telegram_links AS existing
              WHERE existing."person_id" = incoming."person_id"
                AND existing."telegram_chat_id" = incoming."telegram_chat_id"
       )
    `;
  }

  return written;
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
