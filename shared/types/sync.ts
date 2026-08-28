/**
 * Контракт экрана «Синхронизация»: то, что ручки `server/api/sync/` отдают, а страница
 * и компоненты принимают.
 *
 * Типы лежат в `shared/`, а не в `server/types/`, потому что у них два потребителя —
 * обработчик и разметка. Второе описание тех же полей на стороне фронта разошлось бы
 * с первым на ближайшей правке.
 */

// Словари прогонов берутся у Prisma, а не переписываются здесь строковым объединением:
// это наши перечисления, они меняются нашей же миграцией, и второе их описание разошлось бы
// с первым молча. Импорт только типов — в сборку не попадает ни байта.
import type { SyncKind, SyncSkipReason, SyncStatus } from '../../server/generated/prisma/enums';

/** Виды прогона, у которых бывает расписание. Полный обход реестра сюда не входит. */
export type ScheduledKind = 'orders' | 'orders_catchup' | 'registry';

/**
 * Состояние вида прогона. Три, а не два (issue #29, правило 2).
 *
 * `disabled` — расписание выключено: отставание отметки при этом штатно и тревогой
 * не является. `never` — прогон ни разу не ставил отметку. `stale` — единственное
 * состояние, которое горит красным.
 */
export type WatermarkState = 'ok' | 'stale' | 'disabled' | 'never';

export type SyncWatermark = {
  kind: ScheduledKind;
  /** Пусто, пока ни один успешный прогон отметку не ставил. */
  watermark: string | null;
  /** Отставание отметки от текущего момента, мс. Пусто вместе с отметкой. */
  lagMs: number | null;
  /** Когда отметку трогали последний раз. Пусто, если строки отметки ещё нет. */
  updatedAt: string | null;
  state: WatermarkState;
  /** Стоит ли расписание на очереди. Берётся из конфигурации, а не угадывается по возрасту отметки. */
  scheduled: boolean;
  intervalSec: number;
  /** После какого отставания отметка считается застрявшей. */
  staleThresholdMs: number;
};

export type SyncStateResponse = {
  /** Момент, относительно которого посчитано отставание. */
  now: string;
  watermarks: SyncWatermark[];
};

/** Счётчики прогона заказов. Пусто у прогонов, прошедших до появления таблицы деталей. */
export type OrdersRunDetails = {
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

/** Счётчики прогона реестра. Пусто у прогонов, прошедших до появления таблицы деталей. */
export type RegistryRunDetails = {
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

export type SyncRunRow = {
  id: string;
  kind: SyncKind;
  status: SyncStatus;
  startedAt: string;
  finishedAt: string | null;
  windowFrom: string | null;
  windowTo: string | null;
  /** Сколько прогон шёл. У незакрытого — сколько идёт до сих пор. */
  durationMs: number;
  requests: number;
  rateLimited: number;
  itemsSeen: number;
  itemsWritten: number;
  error: string | null;
  /**
   * Прогон висит в `running` дольше законного (`SYNC_ABANDONED_RUN_MIN`).
   *
   * Успешным он не является и показывается отдельно: строку `running` закрывает сам
   * прогон, а `SIGKILL` такой возможности не даёт.
   */
  stalled: boolean;
  orders: OrdersRunDetails | null;
  registry: RegistryRunDetails | null;
};

export type SyncRunsResponse = {
  now: string;
  runs: SyncRunRow[];
  /** Всего строк журнала — чтобы страница знала, есть ли следующая. */
  total: number;
  limit: number;
  offset: number;
};

/**
 * Свод за период. Каждое число — различные сущности из таблиц данных по времени события,
 * а не сумма счётчиков прогонов (issue #29, правило 1).
 *
 * Счётчиков, которые различным подсчётом не берутся, здесь нет намеренно: «уже начислено»
 * и «не разобрано» — события прогона, и суммировать их по периоду бессмысленно, сколько бы
 * ни оказалась разница с числом заказов.
 */
export type SyncPeriodSummary = {
  /** `day` или `week`. Ключ, а не подпись: подпись рисует разметка. */
  period: 'day' | 'week';
  /** Начало периода. */
  from: string;
  /** Различных поездок с временем завершения внутри периода. */
  trips: number;
  /** Из них завершённых — тех, за которые начисляется балл. */
  tripsCompleted: number;
  /** Различных начислений за поездки: строки журнала с причиной `trip` по времени операции. */
  awards: number;
  /**
   * Различных завершённых поездок водителей, которых нет в программе.
   *
   * Реестр парка шире программы, и это штатно, а не отказ. Считается через профиль
   * и человека до строки участия, а не суммой счётчика прогонов.
   */
  outsideProgram: number;
  /** Различного пропущенного, впервые увиденного внутри периода. */
  skipsFirstSeen: number;
  /** Из них не разрешено до сих пор. */
  skipsUnresolved: number;
  /** Прогонов за период. Прогон — сущность, а не счётчик: складывать здесь нечего. */
  runs: number;
  runsFailed: number;
};

export type SyncSummaryResponse = {
  now: string;
  /**
   * С какого момента у нас вообще есть данные — двумя границами, а не одной.
   *
   * Подпись периода обязана это сказать: «за сутки» на шестичасовой истории — неправда.
   * Границ две, потому что они разные: журнал начинается с первого прогона, а поездки
   * приезжают окном опроса, и догоняющий прогон приносит их за неделю назад.
   */
  journalSince: string | null;
  tripsSince: string | null;
  periods: SyncPeriodSummary[];
};

export type SyncSkipRow = {
  reason: SyncSkipReason;
  /** Идентификатор заказа либо строка `словарь=значение`. Персональных данных здесь нет. */
  reference: string;
  detail: string | null;
  timesSeen: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type SyncSkipsResponse = {
  skips: SyncSkipRow[];
  total: number;
  limit: number;
  offset: number;
};
