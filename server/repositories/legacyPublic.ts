import pg from 'pg';

import { USABLE_CHAT_ID_PATTERN } from '#server/utils/legacyChatId';

/**
 * Чтение старой схемы `public`. Только чтение — и это свойство сеанса, а не дисциплины.
 *
 * `public` принадлежит старому боту: писать в неё нельзя ничем и никогда
 * (CLAUDE.md → «Важные ограничения»). Поэтому репозиторий поднимает **своё** соединение
 * с `default_transaction_read_only = on` вместо того, чтобы читать теми же руками,
 * которыми перенос пишет в `xb`: у сеанса Prisma запись разрешена по построению, и запрет
 * держался бы только на том, что никто не написал `INSERT`. Здесь любая попытка изменить
 * что-либо отбивается базой.
 *
 * Prisma сюда не годится ещё и по своей причине: она владеет только схемой `xb`, таблиц
 * старого бота в её моделях нет и быть не должно (docs/decisions.md → «Наши таблицы —
 * в схеме `xb`»).
 */

/** Строка `public."Drivers"` в том виде, в каком она нужна переносу. */
export type LegacyDriverRow = {
  /** `public."Drivers".id`, он же ключ `legacy_driver_map`. */
  legacyDriverId: number;
  /** Идентификатор профиля парка. Ключ сопоставления: 4 098 записей из 4 099. */
  profileId: string;
  /** `NULL` у семи записей — переносится как ноль. */
  points: number | null;
  chatId: string | null;
  language: string;
  createdAt: Date;
};

type RawLegacyDriverRow = {
  id: number;
  profile_id: string;
  points: number | null;
  chat_id: string | null;
  language: string;
  createdAt: Date;
};

/**
 * Эталон контрольных цифр, снятый со старой схемы до шагов, которые пишут карту переноса
 * и балансы.
 *
 * Считается один раз, в начале прогона: снятый после переноса, он сравнивал бы результат
 * сам с собой. Величины здесь — те, что старая схема выводит запросом; склеенные пары
 * и люди с несколькими профилями запросом к ней не выводятся и берутся правилами самого
 * переноса.
 */
export type LegacyControlBaseline = {
  /** Когда снят. Уходит в отчёт: цифры принадлежат состоянию базы на этот момент. */
  takenAt: Date;
  /** Имя базы-источника, ответ `current_database()`. Тоже в отчёт: дампов у нас несколько. */
  databaseName: string;
  legacyRecords: number;
  matchedRecords: number;
  unmatchedRecords: number;
  positiveBalances: number;
  pointsTransferred: number;
  invalidChatIds: number;
};

type RawControlBaselineRow = {
  databaseName: string;
  legacyRecords: string;
  matchedRecords: string;
  unmatchedRecords: string;
  positiveBalances: string;
  pointsTransferred: string;
  invalidChatIds: string;
};

/** Соединение открыто, и режим только чтения подтверждён самой базой, а не нами. */
export type LegacyReadSession = {
  readDrivers: () => Promise<LegacyDriverRow[]>;
  readControlBaseline: () => Promise<LegacyControlBaseline>;
  /** Что ответила база на `SHOW default_transaction_read_only`. Уходит в отчёт прогона. */
  readOnlyMode: string;
  close: () => Promise<void>;
};

const READ_ONLY_OPTIONS = '-c default_transaction_read_only=on';

export class LegacySessionError extends Error {
  constructor(message: string) {
    super(`сеанс чтения public: ${message}`);
    this.name = 'LegacySessionError';
  }
}

/**
 * Открывает сеанс только для чтения и убеждается, что база с этим согласна.
 *
 * Проверка не декоративная: `options` в строке подключения молча игнорируется частью
 * пулеров, и сеанс, который мы считаем читающим, оказался бы обычным. Спрашиваем у базы.
 */
export const openLegacyReadSession = async (connectionString: string): Promise<LegacyReadSession> => {
  const client = new pg.Client({ connectionString, options: READ_ONLY_OPTIONS });

  await client.connect();

  const mode = await client.query<{ default_transaction_read_only: string }>(
    'SHOW default_transaction_read_only',
  );
  const readOnlyMode = mode.rows[0]?.default_transaction_read_only ?? 'unknown';

  if (readOnlyMode !== 'on') {
    await client.end();
    throw new LegacySessionError(
      `база отвечает default_transaction_read_only = ${readOnlyMode}, а перенос читает public только в режиме только чтения`,
    );
  }

  return {
    readOnlyMode,
    readDrivers: async () => {
      // Схема указана явно — `public."Drivers"`, а не `"Drivers"`: у этого соединения
      // search_path свой, и полагаться на него незачем.
      const result = await client.query<RawLegacyDriverRow>(
        'SELECT "id", "profile_id", "points", "chat_id", "language", "createdAt" FROM public."Drivers" ORDER BY "id"',
      );

      return result.rows.map((row) => ({
        legacyDriverId: row.id,
        profileId: row.profile_id,
        points: row.points,
        chatId: row.chat_id,
        language: row.language,
        createdAt: row.createdAt,
      }));
    },
    readControlBaseline: async () => {
      // Присоединение к `xb.park_profiles` — то, чем «сопоставленная запись» вообще
      // определяется: сопоставление идёт по `profile_id`, и без реестра парка вопрос
      // «сколько записей перенесётся» смысла не имеет. Сеанс read-only, читаются обе
      // схемы, записать он не может ни в одну.
      //
      // Годность `chat_id` проверяется шаблоном из `utils/legacyChatId`, тем же самым,
      // которым её проверяет перенос: правило одно, движка два.
      const result = await client.query<RawControlBaselineRow>(
        `SELECT current_database()                                    AS "databaseName",
                COUNT(*)                                              AS "legacyRecords",
                COUNT(*) FILTER (WHERE profile."profile_id" IS NOT NULL) AS "matchedRecords",
                COUNT(*) FILTER (WHERE profile."profile_id" IS NULL)     AS "unmatchedRecords",
                COUNT(*) FILTER (
                  WHERE profile."profile_id" IS NOT NULL
                    AND COALESCE(driver."points", 0) > 0
                )                                                     AS "positiveBalances",
                COALESCE(
                  SUM(COALESCE(driver."points", 0))
                    FILTER (WHERE profile."profile_id" IS NOT NULL),
                  0
                )                                                     AS "pointsTransferred",
                COUNT(*) FILTER (
                  WHERE profile."profile_id" IS NOT NULL
                    AND (driver."chat_id" IS NULL OR driver."chat_id" !~ $1)
                )                                                     AS "invalidChatIds"
           FROM public."Drivers" AS driver
           LEFT JOIN xb.park_profiles AS profile
             ON profile."profile_id" = driver."profile_id"`,
        [USABLE_CHAT_ID_PATTERN],
      );

      const row = result.rows[0];

      if (!row) {
        throw new LegacySessionError('запрос эталона не вернул ни строки');
      }

      return {
        takenAt: new Date(),
        databaseName: row.databaseName,
        // `COUNT` и `SUM` приходят из драйвера строками: это `bigint` базы, и молча
        // терять его точность драйвер не станет. Суммы переноса — девять миллионов,
        // до предела точности числа отсюда девять порядков.
        legacyRecords: Number(row.legacyRecords),
        matchedRecords: Number(row.matchedRecords),
        unmatchedRecords: Number(row.unmatchedRecords),
        positiveBalances: Number(row.positiveBalances),
        pointsTransferred: Number(row.pointsTransferred),
        invalidChatIds: Number(row.invalidChatIds),
      };
    },
    close: () => client.end(),
  };
};
