import { deskDriverName } from '#server/repositories/deskDriver';
import {
  listApplicationRows,
  readApplicationTotals,
  type ApplicationListRow,
  type ApplicationRowFilter,
  type ApplicationSearch,
} from '#server/repositories/candidateApplicationAdmin';
import { formatDayKey, shiftDayKey } from '#server/utils/parkTime';
import {
  APPLICATION_OVERDUE_HOURS,
  APPLICATIONS_PAGE_SIZE,
  type ApplicationFilter,
  UNFINISHED_VISIBLE_AFTER_MINUTES,
} from '#shared/candidateApplications';
import { formatPhone } from '#shared/phone';
import type { ApplicationList, ApplicationRow, ApplicationWaitingFrom } from '#shared/types/applications';

/**
 * Список заявок раздела «Заявки» (issue #471): плитки, число у каждой пилюли, страница строк.
 *
 * Плитки — за всё время, без фильтра и поиска; пилюли — с поиском, без фильтра; строки —
 * под фильтром и поиском. Всего строк — число пилюли выбранного фильтра: оно посчитано тем же
 * правилом, что и сами строки.
 *
 * Люди из «Не закончили» (issue #475) входят в плитку «Ждут ответа», если написали сами, и считаются
 * своей пилюлей; строки вкладки отдаёт `listUnfinished`. В «Дольше суток» их нет.
 */

/** Сколько суток в окне «за 7 дней» — сегодня включительно. */
const WEEK_DAYS = 7;

const MINUTE_MS = 60 * 1_000;

const HOUR_MS = 60 * MINUTE_MS;

/** Молчащий человек попадает в «Не закончили», если нажал `/start` раньше этого момента. */
export const unfinishedVisibleBefore = (now: Date): Date =>
  new Date(now.getTime() - UNFINISHED_VISIBLE_AFTER_MINUTES * MINUTE_MS);

/** Знаки, которые в номере отбрасываются: так номер пишут в переписке и на бумаге. */
const PHONE_SEPARATORS = /[\s\-+]/g;

/**
 * Поиск из строки запроса. Номер ищется по цифрам, только если запрос без разделителей —
 * одни цифры: «Азиз 90» номером не считается.
 */
export const readApplicationSearch = (query: string): ApplicationSearch => {
  const text = query.trim();
  const digits = text.replace(PHONE_SEPARATORS, '');

  return { text, digits: /^\d+$/.test(digits) ? digits : '' };
};

const rowFilter = (filter: ApplicationFilter): ApplicationRowFilter => {
  if (filter === 'all') return { kind: 'all' };
  if (filter === 'waiting') return { kind: 'waiting' };

  return { kind: 'status', status: filter };
};

/** Момент ожидания и от чего он считан. Не ждёт — пусто. */
export const readWaiting = (row: {
  waiting: boolean;
  waitAnchor: Date;
  candidateWrote: boolean;
}): { waitingSince: string | null; waitingFrom: ApplicationWaitingFrom | null } =>
  row.waiting
    ? { waitingSince: row.waitAnchor.toISOString(), waitingFrom: row.candidateWrote ? 'candidate' : 'submitted' }
    : { waitingSince: null, waitingFrom: null };

const toRow = (row: ApplicationListRow): ApplicationRow => ({
  id: row.id,
  name: row.name,
  phone: formatPhone(row.phoneE164).display,
  phoneManual: row.phoneSource === 'manual',
  status: row.status,
  promoName: row.promoName,
  promoCode: row.promoCode,
  createdAt: row.createdAt.toISOString(),
  match: row.match,
  lastTripDay: row.lastTripDay,
  telegramWasMember: row.formerLinkPersonId !== null,
  formerDriverName:
    row.formerLinkPersonId === null ? null : deskDriverName({ firstName: row.formerFirstName, lastName: row.formerLastName }),
  formerDriverCallsign: row.formerCallsign,
  handledBy: row.handledBy,
  ...readWaiting(row),
});

export type ListApplicationsInput = {
  filter: ApplicationFilter;
  query: string;
  offset: number;
  now?: Date;
};

export const listApplications = async ({
  filter,
  query,
  offset,
  now = new Date(),
}: ListApplicationsInput): Promise<ApplicationList> => {
  const search = readApplicationSearch(query);
  const limit = APPLICATIONS_PAGE_SIZE;

  const [rows, totals] = await Promise.all([
    listApplicationRows({ search, filter: rowFilter(filter), offset, limit }),
    readApplicationTotals({
      search,
      overdueBefore: new Date(now.getTime() - APPLICATION_OVERDUE_HOURS * HOUR_MS),
      weekFromDay: shiftDayKey(formatDayKey(now), -(WEEK_DAYS - 1)),
      unfinishedVisibleBefore: unfinishedVisibleBefore(now),
    }),
  ]);

  const counts = {
    all: totals.countAll,
    waiting: totals.countWaiting,
    new: totals.countNew,
    in_progress: totals.countInProgress,
    hired: totals.countHired,
    rejected: totals.countRejected,
    unfinished: totals.countUnfinished,
  };

  return {
    tiles: {
      waiting: totals.waiting + totals.waitingUnfinished,
      waitingUnfinished: totals.waitingUnfinished,
      overdue: totals.overdue,
      total: totals.total,
      totalWeek: totals.totalWeek,
      hired: totals.hired,
      hiredWeek: totals.hiredWeek,
    },
    counts,
    rows: rows.map(toRow),
    total: counts[filter],
    offset,
    limit,
  };
};
