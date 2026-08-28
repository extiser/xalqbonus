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
