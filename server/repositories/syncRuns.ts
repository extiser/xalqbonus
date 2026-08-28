import { db } from '#server/db';
import type { SyncKind, SyncStatus } from '#server/generated/prisma/enums';

/**
 * Журнал прогонов синхронизации.
 *
 * Строка заводится в начале прогона и закрывается в конце — успехом или отказом. Прогон,
 * упавший на середине, обязан остаться в базе видимым отказом: в старом боте неуспех
 * не оставлял следа, отметка при этом сдвигалась, и потери выглядели нормой
 * (docs/decisions.md → «Отметка синхронизации двигается только после успешного прогона»).
 */

export type SyncRunCounters = {
  requests: number;
  rateLimited: number;
  itemsSeen: number;
  itemsWritten: number;
};

/**
 * Заводит строку прогона.
 *
 * Нижняя граница окна может быть пустой: у полного обхода реестра окна нет вовсе —
 * он берёт всё, что знает парк, и подставлять ему выдуманную границу значило бы соврать
 * в журнале.
 */
export const startSyncRun = async (
  kind: SyncKind,
  windowFrom: Date | null,
  windowTo: Date | null,
): Promise<string> => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.sync_runs ("kind", "status", "window_from", "window_to")
    VALUES (
      ${kind}::xb.sync_kind,
      'running'::xb.sync_status,
      ${windowFrom?.toISOString() ?? null}::timestamptz,
      ${windowTo?.toISOString() ?? null}::timestamptz
    )
    RETURNING "id"
  `;

  const run = rows[0];

  if (!run) {
    throw new Error(`строка прогона ${kind} не завелась`);
  }

  return run.id;
};

/**
 * Закрывает прогон. Счётчики пишутся и при отказе: именно у упавшего прогона важно видеть,
 * сколько запросов он успел сделать и сколько раз получил отказ по лимиту.
 */
export const finishSyncRun = async (
  runId: string,
  status: SyncStatus,
  counters: SyncRunCounters,
  error: string | null,
): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.sync_runs
       SET "status"        = ${status}::xb.sync_status,
           "finished_at"   = now(),
           "requests"      = ${counters.requests},
           "rate_limited"  = ${counters.rateLimited},
           "items_seen"    = ${counters.itemsSeen},
           "items_written" = ${counters.itemsWritten},
           "error"         = ${error}
     WHERE "id" = ${runId}::uuid
  `;
};

/**
 * Поправляет верхнюю границу окна уже заведённого прогона.
 *
 * Нужна ровно одному случаю: инкрементальный прогон профилей ужимает окно по промеру
 * `total`, если изменившихся в нём больше, чем берётся разрешённой глубиной offset.
 * Строка прогона заводится до промера — иначе промер шёл бы вне журнала, — и после
 * ужатия обязана показывать то, что реально спрашивали у API, а не то, что собирались.
 *
 * Журнал, в котором `window_to` не равен фактической границе фильтра, хуже отсутствующего:
 * по нему будут сверять, за какой отрезок времени мы видели парк.
 */
export const narrowSyncRunWindow = async (runId: string, windowTo: Date): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.sync_runs
       SET "window_to" = ${windowTo.toISOString()}::timestamptz
     WHERE "id" = ${runId}::uuid
  `;
};

/**
 * Закрывает прогоны, оставшиеся в состоянии `running` дольше положенного.
 *
 * Зовётся при старте воркера. Прогон закрывает свою строку сам — успехом или отказом, —
 * но `SIGKILL` такой возможности не даёт: `docker stop` по таймауту и убийство по памяти
 * оставляют строку бежать вечно, и журнал прогонов начинает копить вечно бегущие строки.
 *
 * По возрасту, а не «все подряд»: рядом с воркером живёт разовый прогон командой
 * `make sync-orders`, и он законно идёт своей строкой в тот момент, когда воркер
 * перезапускается.
 */
export const failAbandonedRuns = async (startedBefore: Date): Promise<number> =>
  db.$executeRaw`
    UPDATE xb.sync_runs
       SET "status"      = 'failed'::xb.sync_status,
           "finished_at" = now(),
           "error"       = 'прогон оборван, воркер перезапущен'
     WHERE "status" = 'running'
       AND "started_at" < ${startedBefore.toISOString()}::timestamptz
  `;

/**
 * Строка журнала вместе с разбором — тем, который бывает у этого вида прогона.
 *
 * Детали приезжают одним запросом, а не отдельной ручкой на раскрытие строки: страница
 * журнала — двадцать строк, и двадцать дополнительных обходов ради счётчиков, которые
 * уже лежат рядом по внешнему ключу, ничего не экономят.
 *
 * Пусто у прогонов, прошедших до появления таблиц деталей: строки задним числом
 * не досочинялись.
 */
export type SyncRunListRow = {
  id: string;
  kind: SyncKind;
  status: SyncStatus;
  startedAt: Date;
  finishedAt: Date | null;
  windowFrom: Date | null;
  windowTo: Date | null;
  requests: number;
  rateLimited: number;
  itemsSeen: number;
  itemsWritten: number;
  error: string | null;
  orders: SyncRunOrdersDetails | null;
  registry: SyncRunRegistryDetails | null;
};

export type SyncRunOrdersDetails = {
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

export type SyncRunRegistryDetails = {
  pages: number;
  profilesSeen: number;
  profilesInserted: number;
  profilesUpdated: number;
  responseRows: number;
  personsCreated: number;
  statusEvents: number;
  phonesOpened: number;
  phonesClosed: number;
  licensesUpdated: number;
  licenseConflicts: number;
  skippedWithoutLicense: number;
  malformed: number;
  resolvedSkips: number;
  chunksTotal: number;
  chunksWindowed: number;
  maxOffsetDepth: number;
};

/**
 * Плоская строка соединения. Разбор двух видов прогона живёт в разных таблицах, и в одну
 * строку они складываются с префиксами: обе половины одновременно не заполнены никогда.
 */
type SyncRunJoinedRow = {
  id: string;
  kind: SyncKind;
  status: SyncStatus;
  startedAt: Date;
  finishedAt: Date | null;
  windowFrom: Date | null;
  windowTo: Date | null;
  requests: number;
  rateLimited: number;
  itemsSeen: number;
  itemsWritten: number;
  error: string | null;
  ordersPages: number | null;
  ordersInserted: number | null;
  ordersUpdated: number | null;
  ordersMalformed: number | null;
  ordersSkippedUnknownProfile: number | null;
  ordersUnknownProfiles: number | null;
  ordersAwarded: number | null;
  ordersAlreadyAwarded: number | null;
  ordersNotCompleted: number | null;
  ordersWithoutEndedAt: number | null;
  ordersOutsideProgram: number | null;
  ordersUnknownTrip: number | null;
  registryPages: number | null;
  registryProfilesSeen: number | null;
  registryProfilesInserted: number | null;
  registryProfilesUpdated: number | null;
  registryResponseRows: number | null;
  registryPersonsCreated: number | null;
  registryStatusEvents: number | null;
  registryPhonesOpened: number | null;
  registryPhonesClosed: number | null;
  registryLicensesUpdated: number | null;
  registryLicenseConflicts: number | null;
  registrySkippedWithoutLicense: number | null;
  registryMalformed: number | null;
  registryResolvedSkips: number | null;
  registryChunksTotal: number | null;
  registryChunksWindowed: number | null;
  registryMaxOffsetDepth: number | null;
};

/**
 * Соединение либо не дало строки деталей, либо дало её целиком: `run_id` — первичный ключ
 * обеих таблиц разбора, и половины заполненной строки не бывает. Проверяется первое поле,
 * остальные берутся с умолчанием, чтобы `null` из соединения не протёк наружу числом.
 */
const toOrdersDetails = (row: SyncRunJoinedRow): SyncRunOrdersDetails | null => {
  if (row.ordersPages === null) {
    return null;
  }

  return {
    pages: row.ordersPages,
    ordersInserted: row.ordersInserted ?? 0,
    ordersUpdated: row.ordersUpdated ?? 0,
    malformed: row.ordersMalformed ?? 0,
    skippedUnknownProfile: row.ordersSkippedUnknownProfile ?? 0,
    unknownProfiles: row.ordersUnknownProfiles ?? 0,
    awarded: row.ordersAwarded ?? 0,
    alreadyAwarded: row.ordersAlreadyAwarded ?? 0,
    notCompleted: row.ordersNotCompleted ?? 0,
    withoutEndedAt: row.ordersWithoutEndedAt ?? 0,
    outsideProgram: row.ordersOutsideProgram ?? 0,
    unknownTrip: row.ordersUnknownTrip ?? 0,
  };
};

const toRegistryDetails = (row: SyncRunJoinedRow): SyncRunRegistryDetails | null => {
  if (row.registryPages === null) {
    return null;
  }

  return {
    pages: row.registryPages,
    profilesSeen: row.registryProfilesSeen ?? 0,
    profilesInserted: row.registryProfilesInserted ?? 0,
    profilesUpdated: row.registryProfilesUpdated ?? 0,
    responseRows: row.registryResponseRows ?? 0,
    personsCreated: row.registryPersonsCreated ?? 0,
    statusEvents: row.registryStatusEvents ?? 0,
    phonesOpened: row.registryPhonesOpened ?? 0,
    phonesClosed: row.registryPhonesClosed ?? 0,
    licensesUpdated: row.registryLicensesUpdated ?? 0,
    licenseConflicts: row.registryLicenseConflicts ?? 0,
    skippedWithoutLicense: row.registrySkippedWithoutLicense ?? 0,
    malformed: row.registryMalformed ?? 0,
    resolvedSkips: row.registryResolvedSkips ?? 0,
    chunksTotal: row.registryChunksTotal ?? 0,
    chunksWindowed: row.registryChunksWindowed ?? 0,
    maxOffsetDepth: row.registryMaxOffsetDepth ?? 0,
  };
};

/**
 * Страница журнала прогонов, новыми вперёд.
 *
 * Постранично, а не «последние N»: журнал растёт на прогон в минуту, и выгружать его
 * целиком в один ответ нельзя уже через сутки.
 */
export const listSyncRuns = async (limit: number, offset: number): Promise<SyncRunListRow[]> => {
  const rows = await db.$queryRaw<SyncRunJoinedRow[]>`
    SELECT run."id",
           run."kind",
           run."status",
           run."started_at"    AS "startedAt",
           run."finished_at"   AS "finishedAt",
           run."window_from"   AS "windowFrom",
           run."window_to"     AS "windowTo",
           run."requests",
           run."rate_limited"  AS "rateLimited",
           run."items_seen"    AS "itemsSeen",
           run."items_written" AS "itemsWritten",
           run."error",
           orders."pages"                   AS "ordersPages",
           orders."orders_inserted"         AS "ordersInserted",
           orders."orders_updated"          AS "ordersUpdated",
           orders."malformed"               AS "ordersMalformed",
           orders."skipped_unknown_profile" AS "ordersSkippedUnknownProfile",
           orders."unknown_profiles"        AS "ordersUnknownProfiles",
           orders."awarded"                 AS "ordersAwarded",
           orders."already_awarded"         AS "ordersAlreadyAwarded",
           orders."not_completed"           AS "ordersNotCompleted",
           orders."without_ended_at"        AS "ordersWithoutEndedAt",
           orders."outside_program"         AS "ordersOutsideProgram",
           orders."unknown_trip"            AS "ordersUnknownTrip",
           registry."pages"                   AS "registryPages",
           registry."profiles_seen"           AS "registryProfilesSeen",
           registry."profiles_inserted"       AS "registryProfilesInserted",
           registry."profiles_updated"        AS "registryProfilesUpdated",
           registry."response_rows"           AS "registryResponseRows",
           registry."persons_created"         AS "registryPersonsCreated",
           registry."status_events"           AS "registryStatusEvents",
           registry."phones_opened"           AS "registryPhonesOpened",
           registry."phones_closed"           AS "registryPhonesClosed",
           registry."licenses_updated"        AS "registryLicensesUpdated",
           registry."license_conflicts"       AS "registryLicenseConflicts",
           registry."skipped_without_license" AS "registrySkippedWithoutLicense",
           registry."malformed"               AS "registryMalformed",
           registry."resolved_skips"          AS "registryResolvedSkips",
           registry."chunks_total"            AS "registryChunksTotal",
           registry."chunks_windowed"         AS "registryChunksWindowed",
           registry."max_offset_depth"        AS "registryMaxOffsetDepth"
      FROM xb.sync_runs AS run
      LEFT JOIN xb.sync_run_orders   AS orders   ON orders."run_id"   = run."id"
      LEFT JOIN xb.sync_run_registry AS registry ON registry."run_id" = run."id"
     ORDER BY run."started_at" DESC
     LIMIT ${limit} OFFSET ${offset}
  `;

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    windowFrom: row.windowFrom,
    windowTo: row.windowTo,
    requests: row.requests,
    rateLimited: row.rateLimited,
    itemsSeen: row.itemsSeen,
    itemsWritten: row.itemsWritten,
    error: row.error,
    orders: toOrdersDetails(row),
    registry: toRegistryDetails(row),
  }));
};

/** Сколько всего строк в журнале: страница обязана знать, есть ли следующая. */
export const countSyncRuns = async (): Promise<number> => {
  // `count(*)` возвращает bigint, а он приезжает из Prisma как BigInt и не сериализуется
  // в JSON. Приведение к int делается здесь, а не в сервисе: наружу репозиторий отдаёт
  // число, а не то, во что его превратил драйвер.
  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total" FROM xb.sync_runs
  `;

  return rows[0]?.total ?? 0;
};
