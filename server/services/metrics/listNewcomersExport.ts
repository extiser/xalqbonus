import { NEWCOMER_FIRST_DAYS, NEWCOMER_TRIPS_TARGET } from '#server/services/metrics/constants';
import { readMetricsMonth } from '#server/services/metrics/monthPeriod';
import type { LeaderContact } from '#server/services/metrics/readLeaders';
import { readNewcomers, type NewcomersReport } from '#server/services/metrics/readNewcomers';
import { formatReportDay } from '#server/services/reports/reportTable';
import { monthForms, monthYear } from '#shared/monthNames';
import { listFromDayText, noNewcomersInMonthText, noNewcomersListText } from '#shared/newcomers';
import type { DashboardNewcomerRow } from '#shared/types/dashboard';
import type { ReportColumn, ReportResult, ReportRow } from '#shared/types/reports';

/**
 * Выгрузка списка «Новички {месяца}: меньше 20 поездок за 14 дней» (issue #407) — кнопка
 * «Выгрузить в Excel» на «Глубине». Те же строки и в том же порядке, что на экране: оба читают
 * `readNewcomers`. Книгу собирает `buildReportWorkbook`, как у лидеров.
 *
 * Телефоны — все незакрытые номера всех профилей человека: список нужен для звонков.
 *
 * Месяц приходит из запроса как есть; негодный — `MetricsMonthError` (`monthPeriod.ts`).
 * Список не строится — `NewcomersListError` с причиной; тексты причин — `shared/newcomers.ts`,
 * одни с экраном. Строится ли он, решает `readNewcomersList`: его зовут и выгрузка, и сегмент
 * из списка (issue #415).
 */

/** Список за месяц не строится. Текст — готовый ответ человеку. */
export class NewcomersListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NewcomersListError';
  }
}

const TITLE = `Новички — меньше ${NEWCOMER_TRIPS_TARGET} поездок за ${NEWCOMER_FIRST_DAYS} дней`;

const COLUMNS: ReportColumn[] = [
  { key: 'callsign', label: 'Позывной', kind: 'text' },
  { key: 'lastName', label: 'Фамилия', kind: 'text' },
  { key: 'firstName', label: 'Имя', kind: 'text' },
  { key: 'middleName', label: 'Отчество', kind: 'text' },
  { key: 'phones', label: 'Телефон', kind: 'text' },
  { key: 'inProgram', label: 'Участник программы', kind: 'text' },
  { key: 'firstTripDay', label: 'Первая поездка', kind: 'text' },
  { key: 'windowTrips', label: `Поездок за ${NEWCOMER_FIRST_DAYS} дней`, kind: 'count' },
  { key: 'lastTripDay', label: 'Последняя поездка', kind: 'text' },
];

const EMPTY_CONTACT: LeaderContact = { lastName: null, firstName: null, middleName: null, phones: null };

const toRow = (row: DashboardNewcomerRow, contact: LeaderContact): ReportRow => ({
  cells: {
    callsign: row.callsign,
    lastName: contact.lastName,
    firstName: contact.firstName,
    middleName: contact.middleName,
    phones: contact.phones,
    inProgram: row.inProgram ? 'да' : 'нет',
    firstTripDay: formatReportDay(row.firstTripDay),
    windowTrips: row.windowTrips,
    lastTripDay: formatReportDay(row.lastTripDay),
  },
  kind: 'row',
});

/**
 * Список за разобранный месяц — строки экрана — или `NewcomersListError` с причиной: новичков нет,
 * собраны не все сутки, 14 дней ещё ни у кого не прошли. Одно место, где решается, строится
 * ли список; условия — те же, что гасят «Выгрузить в Excel» на экране.
 */
export const readNewcomersList = async (
  month: string,
  now: Date,
): Promise<NewcomersReport & { rows: DashboardNewcomerRow[] }> => {
  const { dashboard, contacts } = await readNewcomers(month, now);
  const { firstDays, list } = dashboard;

  if (dashboard.noNewcomers || firstDays === null || list === null) {
    throw new NewcomersListError(noNewcomersListText(month, dashboard.firstCohortMonth));
  }

  if (!firstDays.counted || !list.counted) {
    throw new NewcomersListError('Список не строится: собраны не все сутки, нужные для расчёта.');
  }

  if (firstDays.newcomers === 0) {
    throw new NewcomersListError(noNewcomersInMonthText(month));
  }

  if (firstDays.firstResultsDay !== null) {
    throw new NewcomersListError(listFromDayText(firstDays.firstResultsDay, month, NEWCOMER_FIRST_DAYS));
  }

  return { dashboard, contacts, rows: list.rows };
};

export const listNewcomersExport = async (monthParam: unknown, now: Date = new Date()): Promise<ReportResult> => {
  const month = readMetricsMonth(monthParam, now);
  const { dashboard, contacts, rows: listRows } = await readNewcomersList(month, now);

  const rows = listRows.map((row) => toRow(row, contacts.get(row.personId) ?? EMPTY_CONTACT));

  return {
    report: 'newcomers',
    title: TITLE,
    subtitle: `Новички ${monthYear(month, 'genitive')} · на ${formatReportDay(dashboard.asOfDay)}`,
    generatedAt: now.toISOString(),
    sections: [{ title: 'Новички', columns: COLUMNS, rows, notes: [] }],
    empty: rows.length === 0,
  };
};

/** Имя файла: «Новички — меньше 20 поездок за 14 дней — апрель 2026.xlsx». */
export const newcomersFileName = (monthParam: unknown, now: Date = new Date()): string => {
  const month = readMetricsMonth(monthParam, now);

  return `${TITLE} — ${monthForms(month).nominative} ${month.slice(0, 4)}.xlsx`;
};
