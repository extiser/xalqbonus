import { deskDriverName } from '#server/repositories/deskDriver';
import { listOutsideProgramPeople, type OutsideProgramPersonRow } from '#server/repositories/metrics';
import { monthPeriods, readMetricsMonth } from '#server/services/metrics/monthPeriod';
import { formatReportDay } from '#server/services/reports/reportTable';
import { formatCalendarDate, formatClockTime } from '#server/utils/parkTime';
import type { ReportColumn, ReportResult, ReportRow } from '#shared/types/reports';

/**
 * Выгрузка «Вне программы» за месяц (issue #373): водители на линии без единой привязки
 * Telegram, строка — человек. Те же люди, что в числе на плитке (`readOutsideProgram`), — оба
 * читают одну выборку, и строк в файле ровно столько, сколько на плитке.
 *
 * Книгу собирает `buildReportWorkbook`, как у отчётов раздела: модель отчёта одна.
 *
 * Позывной и имя — из профиля с последней поездкой периода. Телефон — все незакрытые номера
 * всех профилей человека через запятую. Порядок — по поездкам, по убыванию.
 *
 * Месяц приходит из запроса как есть; негодный — `MetricsMonthError` (`monthPeriod.ts`).
 */

const TITLE = 'Вне программы';

const SUBTITLE_NOTE = 'ездят, но ни разу не привязали Telegram';

const COLUMNS: ReportColumn[] = [
  { key: 'callsign', label: 'Позывной', kind: 'text' },
  { key: 'name', label: 'Имя', kind: 'text' },
  { key: 'phones', label: 'Телефон', kind: 'text' },
  { key: 'trips', label: 'Поездок за месяц', kind: 'count' },
  { key: 'lastTripAt', label: 'Последняя поездка', kind: 'text' },
];

/** Месяц словом, именительным: «октябрь». Отдельно от даты `Intl` даёт именно его. */
const MONTH_NAME = new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' });

const toRow = (person: OutsideProgramPersonRow): ReportRow => ({
  cells: {
    callsign: person.callsign,
    name: deskDriverName(person),
    phones: person.phones,
    trips: person.trips,
    lastTripAt:
      person.lastTripAt === null
        ? null
        : `${formatCalendarDate(person.lastTripAt)} ${formatClockTime(person.lastTripAt)}`,
  },
  kind: 'row',
});

export const listOutsideProgramDrivers = async (
  monthParam: unknown,
  now: Date = new Date(),
): Promise<ReportResult> => {
  const month = readMetricsMonth(monthParam, now);
  const { period } = monthPeriods(month, now);
  const people = await listOutsideProgramPeople(period.from, period.to);
  const rows = people.map(toRow);

  return {
    report: 'outside_program',
    title: TITLE,
    subtitle: `${formatReportDay(period.from)}–${formatReportDay(period.to)} · ${SUBTITLE_NOTE}`,
    generatedAt: now.toISOString(),
    sections: [{ title: TITLE, columns: COLUMNS, rows, notes: [] }],
    empty: rows.length === 0,
  };
};

/** Имя файла: «Вне программы — октябрь 2026.xlsx». */
export const outsideProgramFileName = (monthParam: unknown, now: Date = new Date()): string => {
  const month = readMetricsMonth(monthParam, now);
  const monthName = MONTH_NAME.format(new Date(`${month}-01T00:00:00Z`));

  return `${TITLE} — ${monthName} ${month.slice(0, 4)}.xlsx`;
};
