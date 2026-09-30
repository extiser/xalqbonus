import type { ReportPeriodMoments } from '#server/repositories/reports';
import type { PeriodReportParams, ReportOfficeFilter } from '#server/services/reports/reportParams';
import { formatCalendarDate, formatClockTime } from '#server/utils/parkTime';
import { REPORTS_HISTORY_START } from '#shared/reports';
import type { ReportCell, ReportColumn, ReportRow } from '#shared/types/reports';

/**
 * Общее для отчётов раздела: подписи, итоги по офису и раздела, счёт пустых цен.
 *
 * Отчёт собирает строки «офис × товар» по-своему, а итоги у всех одни: так одинаково читается
 * любой раздел, и новый отчёт не пишет их заново.
 */

/** Приписка к архивному офису и товару — та же, что в выборе офиса на экранах. */
const ARCHIVED_SUFFIX = ' (в архиве)';

export const archivedLabel = (name: string, archived: boolean): string =>
  archived ? `${name}${ARCHIVED_SUFFIX}` : name;

/** Товар без имени бывает только черновиком — в отчёт он попадает лишь по ошибке, но не пропадает. */
export const productLabel = (name: string | null, archived: boolean): string =>
  archivedLabel(name ?? 'Без названия', archived);

/** Кусок подписи про офис: выбранный — именем, иначе «все офисы». */
export const officeSubtitle = (office: ReportOfficeFilter | null): string =>
  office === null ? 'Все офисы' : archivedLabel(office.name, office.archived);

/** `2026-09-01` → `01.09.2026` — день, как его читают в подписи и имени файла. */
export const formatReportDay = (day: string): string => {
  const [year, month, date] = day.split('-');

  return `${date}.${month}.${year}`;
};

/**
 * Подпись отчёта по движению товара за период (issue #309): период, офис, сутки. Конец,
 * обрезанный текущим моментом, говорит об этом, как подпись остатков: «На конец» тогда —
 * сейчас, а не 05:00 суток после последних.
 */
export const periodSubtitle = (
  params: PeriodReportParams,
  moments: ReportPeriodMoments,
  historyNote: string,
): string => {
  const period = `${formatReportDay(params.from)}–${formatReportDay(params.to)}`;
  const cut =
    moments.end.getTime() < moments.periodEnd.getTime()
      ? ` · на конец — сейчас, ${formatClockTime(moments.end)} ${formatCalendarDate(moments.end)}`
      : '';
  const subtitle = `${period}${cut} · ${officeSubtitle(params.office)} · сутки с 05:00 по Ташкенту`;

  return params.from < REPORTS_HISTORY_START ? `${subtitle}. ${historyNote}` : subtitle;
};

/** Место отчёта по всему парку — вместо офиса в подписи (issue #310). */
export const PARK_WIDE_SUBTITLE = 'По всему парку';

/** Строка «история с 28.09.2026» для подписи: что именно из старого бота в систему не пришло. */
export const historyNote = (missing: string): string =>
  `Данные — с ${formatReportDay(REPORTS_HISTORY_START)}: ${missing} старого бота в системе нет.`;

/**
 * Подпись отчёта, где событие ложится в сутки парка своим моментом (issue #310), — как у продаж:
 * период, место, сутки, и строка про историю, если период начат до перехода.
 */
export const eventPeriodSubtitle = (
  params: { from: string; to: string },
  place: string,
  history: string,
): string => {
  const subtitle = `${formatReportDay(params.from)}–${formatReportDay(params.to)} · ${place} · сутки с 05:00 по Ташкенту`;

  return params.from < REPORTS_HISTORY_START ? `${subtitle}. ${history}` : subtitle;
};

/** Имя файла выгрузки за период: `{Отчёт} 01.09.2026–30.09.2026.xlsx`, с офисом через пробел. */
export const periodFileName = (
  name: string,
  params: { from: string; to: string; office?: ReportOfficeFilter | null },
): string =>
  [
    name,
    `${formatReportDay(params.from)}–${formatReportDay(params.to)}`,
    ...(params.office ? [params.office.name] : []),
  ].join(' ') + '.xlsx';

/** Период, начатый до перехода: движений остатков старого бота в нашем журнале нет. */
export const STOCK_HISTORY_NOTE = `Данные — с ${formatReportDay(REPORTS_HISTORY_START)}: движения остатков старого бота в системе нет.`;

/** Строка таблицы до итогов — одни ячейки. */
export type ReportTableLine = {
  cells: Record<string, ReportCell>;
};

/** Строка отчёта «по офисам» до итогов: офис для группировки и ячейки. */
export type ReportLine = ReportTableLine & {
  officeId: string;
  officeLabel: string;
};

/**
 * Как считать итог колонки по строкам группы. Колонка без своего правила — сумма.
 *
 * Своё правило нужно тому, что не складывается: заказ с двумя товарами стоит в двух строках,
 * и сумма «Заказов» по строкам посчитала бы его дважды.
 */
export type ReportAggregates<Line extends ReportTableLine> = Partial<
  Record<string, (group: Line[]) => ReportCell>
>;

/**
 * Сумма колонки. `null` в сумму не входит: себестоимость строки без себестоимости не считается
 * нулём, а пропускается — сколько таких, говорит примечание раздела. Если значения нет
 * ни у одной строки группы, нет его и у итога: «0 сум» там было бы неправдой. Пустая группа —
 * это раздел без строк, и его итог — ноль.
 */
const sumColumn = (lines: ReportTableLine[], key: string): number | null => {
  const values = lines
    .map((line) => line.cells[key])
    .filter((value): value is number => typeof value === 'number');

  if (lines.length > 0 && values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0);
};

/**
 * Итоговая строка по строкам группы. Текстовые ячейки пусты, кроме колонки подписи — там
 * подпись итога.
 */
const totalRow = <Line extends ReportTableLine>(
  lines: Line[],
  columns: ReportColumn[],
  aggregates: ReportAggregates<Line>,
  labelKey: string,
  label: string,
  kind: 'subtotal' | 'total',
): ReportRow => {
  const cells: Record<string, ReportCell> = {};

  for (const column of columns) {
    const aggregate = aggregates[column.key];

    if (column.kind === 'text') {
      cells[column.key] = column.key === labelKey ? label : '';
    } else {
      cells[column.key] = aggregate ? aggregate(lines) : sumColumn(lines, column.key);
    }
  }

  return { cells, kind };
};

/** Группа строк для промежуточного итога: по чему группировать и как подписать итог. */
export type ReportGroup = { id: string; label: string };

export type ReportTotalsLayout<Line extends ReportTableLine> = {
  /** Текстовая колонка, где стоит подпись итога: `Итого: {группа}` и `Итого`. */
  labelKey: string;
  /** Группа строки. `null` — промежуточных итогов нет, только `Итого` раздела. */
  group: ((line: Line) => ReportGroup) | null;
  /** Нужен ли группе свой итог. Без правила — нужен всякой. */
  subtotal?: (group: Line[]) => boolean;
  aggregates?: ReportAggregates<Line>;
};

/**
 * Строки раздела с итогами: после строк каждой группы — `Итого: {группа}`, в конце — `Итого`.
 * Строки приходят упорядоченными по группе, группировка идёт подряд.
 *
 * Раздел без строк остаётся с одной строкой `Итого` из нулей: «за розницу ничего» читается
 * иначе, чем пропавший раздел.
 *
 * Группа — не обязательно офис (issue #310): у «Работы сотрудников» итог стоит по сотруднику,
 * у раздела по товарам групп нет вовсе, а подпись итога — в колонке `Товар`.
 */
export const withGroupTotals = <Line extends ReportTableLine>(
  lines: Line[],
  columns: ReportColumn[],
  layout: ReportTotalsLayout<Line>,
): ReportRow[] => {
  const aggregates = layout.aggregates ?? {};
  const rows: ReportRow[] = [];
  let group: Line[] = [];

  const closeGroup = (): void => {
    const first = group[0];

    if (layout.group && first && (layout.subtotal?.(group) ?? true)) {
      const label = `Итого: ${layout.group(first).label}`;

      rows.push(totalRow(group, columns, aggregates, layout.labelKey, label, 'subtotal'));
    }

    group = [];
  };

  for (const line of lines) {
    const first = group[0];

    if (layout.group && first && layout.group(first).id !== layout.group(line).id) {
      closeGroup();
    }

    group.push(line);
    rows.push({ cells: line.cells, kind: 'row' });
  }

  closeGroup();
  rows.push(totalRow(lines, columns, aggregates, layout.labelKey, 'Итого', 'total'));

  return rows;
};

/** Строки раздела с итогами по офисам: при «все офисы» — `Итого: {офис}` после каждого. */
export const withTotals = <Line extends ReportLine>(
  lines: Line[],
  columns: ReportColumn[],
  perOffice: boolean,
  aggregates: ReportAggregates<Line> = {},
): ReportRow[] =>
  withGroupTotals(lines, columns, {
    labelKey: 'office',
    group: perOffice ? (line) => ({ id: line.officeId, label: line.officeLabel }) : null,
    aggregates,
  });

/** Сколько строк без значения в колонке — для примечания об итоге без них. */
export const countMissing = (lines: ReportTableLine[], key: string): number =>
  lines.filter((line) => line.cells[key] === null).length;

/** Примечание в ячейку: причины через `; `, пусто — нет причин. */
export const joinNotes = (notes: (string | false)[]): string =>
  notes.filter((note): note is string => note !== false).join('; ');

export const NO_COST_NOTE = 'нет себестоимости';

export const missingCostNote = (count: number): string =>
  `Себестоимость без учёта позиций без себестоимости: ${count}`;

/** Пустой ли отчёт: ни одной строки `row` ни в одном разделе. */
export const isEmptyReport = (sections: { rows: ReportRow[] }[]): boolean =>
  sections.every((section) => section.rows.every((row) => row.kind !== 'row'));
