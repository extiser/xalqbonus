import { db } from '#server/db';
import type { LegacyTelegramStatus, MatchMethod } from '#server/generated/prisma/enums';

/**
 * Карта переноса: что стало с каждой записью старой базы.
 *
 * Без неё перенос не идемпотентен и разобраться потом не в чем: вопрос «куда делся
 * водитель 76184» должен иметь ответ через год, а не догадку.
 */

const CHUNK_SIZE = 1_000;

export type LegacyDriverMapInput = {
  legacyDriverId: number;
  profileId: string | null;
  personId: string | null;
  matchMethod: MatchMethod;
  /** Вторая половина двойной пары. Заполняется у обеих половин. */
  mergedIntoLegacyDriverId: number | null;
  telegramStatus: LegacyTelegramStatus;
  /** Баланс старой базы как есть; семь `NULL` в `points` переносятся как ноль. */
  legacyPoints: number;
  note: string | null;
};

/** Кладёт карту переноса: повторный прогон обновляет строки по `legacy_driver_id`. */
export const upsertLegacyDriverMap = async (
  records: readonly LegacyDriverMapInput[],
): Promise<void> => {
  for (let offset = 0; offset < records.length; offset += CHUNK_SIZE) {
    const chunk = records.slice(offset, offset + CHUNK_SIZE);

    await db.$executeRaw`
      INSERT INTO xb.legacy_driver_map (
        "legacy_driver_id", "profile_id", "person_id", "match_method",
        "merged_into_legacy_driver_id", "telegram_status", "legacy_points", "note"
      )
      SELECT * FROM unnest(
        ${chunk.map((record) => record.legacyDriverId)}::integer[],
        ${chunk.map((record) => record.profileId)}::text[],
        ${chunk.map((record) => record.personId)}::text[]::uuid[],
        ${chunk.map((record) => record.matchMethod)}::text[]::xb.match_method[],
        ${chunk.map((record) => record.mergedIntoLegacyDriverId)}::integer[],
        ${chunk.map((record) => record.telegramStatus)}::text[]::xb.legacy_telegram_status[],
        ${chunk.map((record) => record.legacyPoints)}::integer[],
        ${chunk.map((record) => record.note)}::text[]
      )
      ON CONFLICT ("legacy_driver_id") DO UPDATE SET
        "profile_id"                   = EXCLUDED."profile_id",
        "person_id"                    = EXCLUDED."person_id",
        "match_method"                 = EXCLUDED."match_method",
        "merged_into_legacy_driver_id" = EXCLUDED."merged_into_legacy_driver_id",
        "telegram_status"              = EXCLUDED."telegram_status",
        "legacy_points"                = EXCLUDED."legacy_points",
        "note"                         = EXCLUDED."note"
    `;
  }
};

/** Сколько записей ушло в каждый статус привязки. Строка отчёта прогона. */
export const countByTelegramStatus = async (): Promise<Map<LegacyTelegramStatus, number>> => {
  const rows = await db.$queryRaw<{ telegramStatus: LegacyTelegramStatus; total: bigint }[]>`
    SELECT "telegram_status" AS "telegramStatus", COUNT(*) AS total
      FROM xb.legacy_driver_map
     GROUP BY "telegram_status"
     ORDER BY "telegram_status"
  `;

  return new Map(rows.map((row) => [row.telegramStatus, Number(row.total)]));
};

/** Сколько записей сопоставлено каждым методом. */
export const countByMatchMethod = async (): Promise<Map<MatchMethod, number>> => {
  const rows = await db.$queryRaw<{ matchMethod: MatchMethod; total: bigint }[]>`
    SELECT "match_method" AS "matchMethod", COUNT(*) AS total
      FROM xb.legacy_driver_map
     GROUP BY "match_method"
     ORDER BY "match_method"
  `;

  return new Map(rows.map((row) => [row.matchMethod, Number(row.total)]));
};

export type LegacyDriverMapCounts = {
  records: number;
  matched: number;
  unmatched: number;
  positiveBalances: number;
  mergedPairs: number;
  invalidChatIds: number;
};

/**
 * Что реально легло в карту переноса. Это результат, с которым сверяется эталон,
 * снятый со старой схемы до прогона.
 *
 * Считается по базе, а не по счётчикам прогона: счётчик прогона знает, что скрипт
 * собирался записать, и о пропущенной вставке рассказать не может — он и сам её
 * не заметил.
 *
 * Пары двойников считаются различными людьми, а не половинами пополам: половин
 * нечётное число только при битой записи, и делённое на два оно дало бы дробь вместо
 * внятного расхождения.
 */
export const readLegacyDriverMapCounts = async (): Promise<LegacyDriverMapCounts> => {
  const rows = await db.$queryRaw<
    {
      records: bigint;
      matched: bigint;
      unmatched: bigint;
      positiveBalances: bigint;
      mergedPairs: bigint;
      invalidChatIds: bigint;
    }[]
  >`
    SELECT COUNT(*)                                                  AS "records",
           COUNT(*) FILTER (WHERE "person_id" IS NOT NULL)           AS "matched",
           COUNT(*) FILTER (WHERE "person_id" IS NULL)               AS "unmatched",
           COUNT(*) FILTER (
             WHERE "person_id" IS NOT NULL AND "legacy_points" > 0
           )                                                         AS "positiveBalances",
           COUNT(DISTINCT "person_id") FILTER (
             WHERE "merged_into_legacy_driver_id" IS NOT NULL
           )                                                         AS "mergedPairs",
           COUNT(*) FILTER (WHERE "telegram_status" = 'invalid_chat') AS "invalidChatIds"
      FROM xb.legacy_driver_map
  `;

  const row = rows[0];

  return {
    records: Number(row?.records ?? 0n),
    matched: Number(row?.matched ?? 0n),
    unmatched: Number(row?.unmatched ?? 0n),
    positiveBalances: Number(row?.positiveBalances ?? 0n),
    mergedPairs: Number(row?.mergedPairs ?? 0n),
    invalidChatIds: Number(row?.invalidChatIds ?? 0n),
  };
};

/**
 * Приехал ли этот человек из старой базы.
 *
 * Строка карты с непустым `person_id` — единственный признак перенесённого участника,
 * и на нём стоит запрет приветственного бонуса (docs/decisions.md → «Приветственный
 * бонус — только новым, заявки старого бота не переносятся»). Строки с пустым `person_id` —
 * записи старой базы, которые не сопоставились ни с кем: человека за ними нет,
 * и к вопросу «новичок ли этот человек» они отношения не имеют.
 */
export const hasLegacyRecord = async (personId: string): Promise<boolean> => {
  const rows = await db.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS(
             SELECT 1 FROM xb.legacy_driver_map WHERE "person_id" = ${personId}::uuid
           ) AS "exists"
  `;

  return rows[0]?.exists ?? false;
};
