import pg from 'pg';

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

/** Соединение открыто, и режим только чтения подтверждён самой базой, а не нами. */
export type LegacyReadSession = {
  readDrivers: () => Promise<LegacyDriverRow[]>;
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
    close: () => client.end(),
  };
};
