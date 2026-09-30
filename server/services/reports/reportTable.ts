import type { ReportOfficeFilter } from '#server/services/reports/reportParams';
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

/** Строка отчёта до итогов: офис для группировки и ячейки. */
export type ReportLine = {
  officeId: string;
  officeLabel: string;
  cells: Record<string, ReportCell>;
};

/**
 * Как считать итог колонки по строкам группы. Колонка без своего правила — сумма.
 *
 * Своё правило нужно тому, что не складывается: заказ с двумя товарами стоит в двух строках,
 * и сумма «Заказов» по строкам посчитала бы его дважды.
 */
export type ReportAggregates<Line extends ReportLine> = Partial<
  Record<string, (group: Line[]) => ReportCell>
>;

/**
 * Сумма колонки. `null` в сумму не входит: себестоимость строки без себестоимости не считается
 * нулём, а пропускается — сколько таких, говорит примечание раздела. Если значения нет
 * ни у одной строки группы, нет его и у итога: «0 сум» там было бы неправдой. Пустая группа —
 * это раздел без строк, и его итог — ноль.
 */
const sumColumn = (lines: ReportLine[], key: string): number | null => {
  const values = lines
    .map((line) => line.cells[key])
    .filter((value): value is number => typeof value === 'number');

  if (lines.length > 0 && values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0);
};

/** Итоговая строка по строкам группы. Текстовые ячейки пусты, кроме офиса — там подпись итога. */
const totalRow = <Line extends ReportLine>(
  lines: Line[],
  columns: ReportColumn[],
  aggregates: ReportAggregates<Line>,
  label: string,
  kind: 'subtotal' | 'total',
): ReportRow => {
  const cells: Record<string, ReportCell> = {};

  for (const column of columns) {
    const aggregate = aggregates[column.key];

    if (column.kind === 'text') {
      cells[column.key] = column.key === 'office' ? label : '';
    } else {
      cells[column.key] = aggregate ? aggregate(lines) : sumColumn(lines, column.key);
    }
  }

  return { cells, kind };
};

/**
 * Строки раздела с итогами: при «все офисы» после строк каждого офиса — `Итого: {офис}`,
 * в конце — `Итого`. Строки приходят упорядоченными по офису, группировка идёт подряд.
 *
 * Раздел без строк остаётся с одной строкой `Итого` из нулей: «за розницу ничего» читается
 * иначе, чем пропавший раздел.
 */
export const withTotals = <Line extends ReportLine>(
  lines: Line[],
  columns: ReportColumn[],
  perOffice: boolean,
  aggregates: ReportAggregates<Line> = {},
): ReportRow[] => {
  const rows: ReportRow[] = [];
  let group: Line[] = [];

  const closeGroup = (): void => {
    const first = group[0];

    if (perOffice && first) {
      rows.push(totalRow(group, columns, aggregates, `Итого: ${first.officeLabel}`, 'subtotal'));
    }

    group = [];
  };

  for (const line of lines) {
    if (group[0] && group[0].officeId !== line.officeId) {
      closeGroup();
    }

    group.push(line);
    rows.push({ cells: line.cells, kind: 'row' });
  }

  closeGroup();
  rows.push(totalRow(lines, columns, aggregates, 'Итого', 'total'));

  return rows;
};

/** Сколько строк без значения в колонке — для примечания об итоге без них. */
export const countMissing = (lines: ReportLine[], key: string): number =>
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
