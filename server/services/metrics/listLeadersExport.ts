import { readMetricsMonth } from '#server/services/metrics/monthPeriod';
import { readLeaders, type LeaderContact, type LeadersReport } from '#server/services/metrics/readLeaders';
import { formatReportDay } from '#server/services/reports/reportTable';
import { monthForms } from '#shared/monthNames';
import type { DashboardLeaderGroup, DashboardLeaderRow } from '#shared/types/dashboard';
import type { ReportColumn, ReportResult, ReportRow } from '#shared/types/reports';

/**
 * Выгрузка списка лидеров «Ездят меньше обычного, перестали или ушли» за месяц (issue #402) —
 * кнопка «Выгрузить в Excel» на «Рычагах». Те же строки и в том же порядке, что на экране:
 * оба читают `readLeaders`. Книгу собирает `buildReportWorkbook`, как у «Вне программы».
 *
 * Телефоны — все незакрытые номера всех профилей человека: список нужен для звонков.
 *
 * Месяц приходит из запроса как есть; негодный — `MetricsMonthError` (`monthPeriod.ts`).
 * Список не строится — `LeadersListError` с причиной. Строится ли он, решает `readLeadersList`:
 * его зовут и выгрузка, и сегмент из списка (issue #415).
 */

/** Список за месяц не строится: лидеров нет или собраны не все сутки. Текст — готовый ответ. */
export class LeadersListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadersListError';
  }
}

const TITLE = 'Лидеры — ездят меньше, перестали, ушли';

const COLUMNS: ReportColumn[] = [
  { key: 'callsign', label: 'Позывной', kind: 'text' },
  { key: 'lastName', label: 'Фамилия', kind: 'text' },
  { key: 'firstName', label: 'Имя', kind: 'text' },
  { key: 'middleName', label: 'Отчество', kind: 'text' },
  { key: 'phones', label: 'Телефон', kind: 'text' },
  { key: 'inProgram', label: 'Участник программы', kind: 'text' },
  { key: 'group', label: 'Группа', kind: 'text' },
  { key: 'weekTrips', label: 'Поездок за неделю', kind: 'count' },
  { key: 'norm', label: 'Норма', kind: 'count' },
  { key: 'deviationPercent', label: 'К норме, %', kind: 'count' },
  { key: 'idleDays', label: 'Не ездит, дней', kind: 'count' },
  { key: 'weeksBelow', label: 'Недель ниже', kind: 'count' },
  { key: 'lastTripDay', label: 'Последняя поездка', kind: 'text' },
];

const GROUP_LABELS: Record<DashboardLeaderGroup, string> = {
  below: 'ездит меньше',
  stopped: 'перестал',
  left: 'ушёл',
};

const EMPTY_CONTACT: LeaderContact = { lastName: null, firstName: null, middleName: null, phones: null };

const toRow = (row: DashboardLeaderRow, contact: LeaderContact): ReportRow => ({
  cells: {
    callsign: row.callsign,
    lastName: contact.lastName,
    firstName: contact.firstName,
    middleName: contact.middleName,
    phones: contact.phones,
    inProgram: row.inProgram ? 'да' : 'нет',
    group: GROUP_LABELS[row.group],
    weekTrips: row.weekTrips,
    norm: row.norm,
    deviationPercent: row.deviationPercent,
    idleDays: row.idleDays,
    weeksBelow: row.weeksBelow,
    lastTripDay: formatReportDay(row.lastTripDay),
  },
  kind: 'row',
});

/**
 * Список за разобранный месяц — строки экрана — или `LeadersListError`: лидеров нет или собраны
 * не все сутки. Одно место, где решается, строится ли список.
 */
export const readLeadersList = async (
  month: string,
  now: Date,
): Promise<LeadersReport & { rows: DashboardLeaderRow[] }> => {
  const { dashboard, contacts } = await readLeaders(month, now);
  const { list } = dashboard;

  if (dashboard.noLeaders || list === null) {
    throw new LeadersListError('Лидеров прошлого месяца нет: история заказов — с октября 2025.');
  }

  if (!list.counted) {
    throw new LeadersListError('Список не строится: собраны не все сутки, нужные для расчёта.');
  }

  return { dashboard, contacts, rows: list.rows };
};

export const listLeadersExport = async (monthParam: unknown, now: Date = new Date()): Promise<ReportResult> => {
  const month = readMetricsMonth(monthParam, now);
  const { dashboard, contacts, rows: listRows } = await readLeadersList(month, now);
  const { leadersMonth, week } = dashboard;

  const rows = listRows.map((row) => toRow(row, contacts.get(row.personId) ?? EMPTY_CONTACT));

  return {
    report: 'leaders',
    title: TITLE,
    subtitle: `Лидеры ${monthForms(leadersMonth).genitive} ${leadersMonth.slice(0, 4)} · последняя полная неделя ${formatReportDay(week.from)}–${formatReportDay(week.to)}`,
    generatedAt: now.toISOString(),
    sections: [{ title: 'Лидеры', columns: COLUMNS, rows, notes: [] }],
    empty: rows.length === 0,
  };
};

/** Имя файла: «Лидеры — ездят меньше, перестали, ушли — октябрь 2026.xlsx». */
export const leadersFileName = (monthParam: unknown, now: Date = new Date()): string => {
  const month = readMetricsMonth(monthParam, now);

  return `${TITLE} — ${monthForms(month).nominative} ${month.slice(0, 4)}.xlsx`;
};
