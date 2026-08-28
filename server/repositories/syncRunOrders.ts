import { db } from '#server/db';

/**
 * Детали прогона синхронизации заказов.
 *
 * Общее у всех прогонов — сколько запросов, сколько отказов по лимиту, сколько записей —
 * живёт в `xb.sync_runs`. Здесь лежит то, чего у прогона реестра не бывает: разбор
 * записи заказов и разбор начисления. Отдельной таблицей именно поэтому: семь колонок,
 * всегда пустых у половины строк, — это «поле есть в таблице, но не для этой строки».
 *
 * Строка пишется один раз на прогон, на любом исходе: у упавшего прогона важнее всего
 * видеть, сколько он успел до падения.
 */

export type SyncRunOrdersCounters = {
  pages: number;
  ordersInserted: number;
  ordersUpdated: number;
  malformed: number;
  skippedUnknownProfile: number;
  unknownProfiles: number;
  awarded: number;
  alreadyAwarded: number;
  notCompleted: number;
  withoutEndedAt: number;
  outsideProgram: number;
  unknownTrip: number;
};

/**
 * Кладёт детали прогона. Повторный вызов с тем же прогоном переписывает строку, а не
 * падает по уникальности: прогон закрывается ровно один раз, но ограничение базы —
 * не то место, о которое должен спотыкаться журнал.
 */
export const saveSyncRunOrders = async (
  runId: string,
  counters: SyncRunOrdersCounters,
): Promise<void> => {
  await db.$executeRaw`
    INSERT INTO xb.sync_run_orders (
      "run_id", "pages", "orders_inserted", "orders_updated",
      "malformed", "skipped_unknown_profile", "unknown_profiles",
      "awarded", "already_awarded", "not_completed",
      "without_ended_at", "outside_program", "unknown_trip"
    )
    VALUES (
      ${runId}::uuid,
      ${counters.pages},
      ${counters.ordersInserted},
      ${counters.ordersUpdated},
      ${counters.malformed},
      ${counters.skippedUnknownProfile},
      ${counters.unknownProfiles},
      ${counters.awarded},
      ${counters.alreadyAwarded},
      ${counters.notCompleted},
      ${counters.withoutEndedAt},
      ${counters.outsideProgram},
      ${counters.unknownTrip}
    )
    ON CONFLICT ("run_id") DO UPDATE
       SET "pages"                   = EXCLUDED."pages",
           "orders_inserted"         = EXCLUDED."orders_inserted",
           "orders_updated"          = EXCLUDED."orders_updated",
           "malformed"               = EXCLUDED."malformed",
           "skipped_unknown_profile" = EXCLUDED."skipped_unknown_profile",
           "unknown_profiles"        = EXCLUDED."unknown_profiles",
           "awarded"                 = EXCLUDED."awarded",
           "already_awarded"         = EXCLUDED."already_awarded",
           "not_completed"           = EXCLUDED."not_completed",
           "without_ended_at"        = EXCLUDED."without_ended_at",
           "outside_program"         = EXCLUDED."outside_program",
           "unknown_trip"            = EXCLUDED."unknown_trip"
  `;
};
