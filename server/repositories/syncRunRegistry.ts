import { db } from '#server/db';

/**
 * Детали прогона синхронизации профилей парка.
 *
 * Общее у всех прогонов — сколько запросов, сколько отказов по лимиту, сколько записей —
 * живёт в `xb.sync_runs`. Здесь лежит то, чего у прогона заказов не бывает: разбор того,
 * что стало с профилями, людьми, журналами статусов, телефонов и удостоверений. Отдельной
 * таблицей по образцу `sync_run_orders`: десяток колонок, всегда пустых у половины строк, —
 * это «поле есть в таблице, но не для этой строки».
 *
 * Строка пишется один раз на прогон, на любом исходе: у упавшего прогона важнее всего
 * видеть, сколько он успел до падения.
 */

export type SyncRunRegistryCounters = {
  /** Сколько запросов-страниц сделал обход. Промеры размеров кусков сюда не входят. */
  pages: number;
  /**
   * Различных профилей, которые показал API, — а не строк ответа.
   *
   * Считать строками нельзя: кусок крупнее 3 000 берётся с двух концов, половины
   * перекрываются намеренно, и профиль из прохода `asc` пришёл бы снова в `desc`.
   * Колонка, означающая у одного вида прогона профили, а у другого строки, делает
   * свод за период бессмысленным.
   */
  profilesSeen: number;
  /** Из них появились в реестре впервые. */
  profilesInserted: number;
  /** Из них уже были: прогон их подтвердил, а не добавил. */
  profilesUpdated: number;
  /** Строк в ответах API. Цена нарезки с двух концов, а не размер парка. */
  responseRows: number;
  personsCreated: number;
  statusEvents: number;
  phonesOpened: number;
  phonesClosed: number;
  licensesUpdated: number;
  /**
   * Сколько удостоверений сменить не удалось: пришедший номер уже активен у другого
   * человека. Объединение людей — это перенос баллов, и синхронизация его не делает.
   */
  licenseConflicts: number;
  /** Профили без номера удостоверения: не заведены, лежат в журнале пропущенного. */
  skippedWithoutLicense: number;
  /** Профили, которым не хватило обязательного поля. Не записаны, потеряны из виду. */
  malformed: number;
  /** Заказы, чей водитель наконец нашёлся: строки `unknown_profile` закрыты. */
  resolvedSkips: number;
  /** Кусков в плане обхода. У инкрементального прогона нарезки нет — ноль. */
  chunksTotal: number;
  /** Сколько кусков не взялись сразу и потребовали дробления окнами по `updated_at`. */
  chunksWindowed: number;
  /**
   * Самый глубокий offset, которого потребовал обход.
   *
   * Не украшение сводки: глубина — единственная величина, по которой видно, что нарезка
   * ещё работает. Рабочий предел 3 500 замерен разведкой, и прогон, подошедший к нему
   * вплотную, — это предупреждение, что кусок вырос и скоро начнёт отбиваться.
   */
  maxOffsetDepth: number;
};

/**
 * Кладёт детали прогона. Повторный вызов с тем же прогоном переписывает строку, а не
 * падает по уникальности: прогон закрывается ровно один раз, но ограничение базы —
 * не то место, о которое должен спотыкаться журнал.
 */
export const saveSyncRunRegistry = async (
  runId: string,
  counters: SyncRunRegistryCounters,
): Promise<void> => {
  await db.$executeRaw`
    INSERT INTO xb.sync_run_registry (
      "run_id", "pages", "profiles_seen", "profiles_inserted", "profiles_updated", "response_rows",
      "persons_created", "status_events", "phones_opened", "phones_closed",
      "licenses_updated", "license_conflicts", "skipped_without_license",
      "malformed", "resolved_skips",
      "chunks_total", "chunks_windowed", "max_offset_depth"
    )
    VALUES (
      ${runId}::uuid,
      ${counters.pages},
      ${counters.profilesSeen},
      ${counters.profilesInserted},
      ${counters.profilesUpdated},
      ${counters.responseRows},
      ${counters.personsCreated},
      ${counters.statusEvents},
      ${counters.phonesOpened},
      ${counters.phonesClosed},
      ${counters.licensesUpdated},
      ${counters.licenseConflicts},
      ${counters.skippedWithoutLicense},
      ${counters.malformed},
      ${counters.resolvedSkips},
      ${counters.chunksTotal},
      ${counters.chunksWindowed},
      ${counters.maxOffsetDepth}
    )
    ON CONFLICT ("run_id") DO UPDATE
       SET "pages"                   = EXCLUDED."pages",
           "profiles_seen"           = EXCLUDED."profiles_seen",
           "profiles_inserted"       = EXCLUDED."profiles_inserted",
           "profiles_updated"        = EXCLUDED."profiles_updated",
           "response_rows"           = EXCLUDED."response_rows",
           "persons_created"         = EXCLUDED."persons_created",
           "status_events"           = EXCLUDED."status_events",
           "phones_opened"           = EXCLUDED."phones_opened",
           "phones_closed"           = EXCLUDED."phones_closed",
           "licenses_updated"        = EXCLUDED."licenses_updated",
           "license_conflicts"       = EXCLUDED."license_conflicts",
           "skipped_without_license" = EXCLUDED."skipped_without_license",
           "malformed"               = EXCLUDED."malformed",
           "resolved_skips"          = EXCLUDED."resolved_skips",
           "chunks_total"            = EXCLUDED."chunks_total",
           "chunks_windowed"         = EXCLUDED."chunks_windowed",
           "max_offset_depth"        = EXCLUDED."max_offset_depth"
  `;
};
