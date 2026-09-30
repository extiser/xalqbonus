import {
  listOrderOutcomesByOffice,
  listOrderOutcomesByProduct,
  type OrderOutcomeOfficeRow,
  type OrderOutcomeProductRow,
} from '#server/repositories/reports';
import type { PeriodReportParams } from '#server/services/reports/reportParams';
import {
  archivedLabel,
  eventPeriodSubtitle,
  historyNote,
  isEmptyReport,
  officeSubtitle,
  periodFileName,
  productLabel,
  withGroupTotals,
  withTotals,
  type ReportAggregates,
  type ReportLine,
  type ReportTableLine,
} from '#server/services/reports/reportTable';
import { REPORT_TITLES } from '#shared/reports';
import type { ReportCell, ReportColumn, ReportResult, ReportSection } from '#shared/types/reports';

/**
 * «Судьба заказов» (issue #310): сколько заказов, оформленных водителем в боте, выдано,
 * отменено и сгорело; какие товары заказывают и не забирают.
 *
 * Заказ ложится в сутки своего оформления, статус — на момент построения отчёта: заказ,
 * оформленный вчера вечером, может ещё ждать выдачи. Заказ у стойки выдаётся сразу, его судьба
 * известна заранее — он здесь не показан.
 */

const DESK_NOTE = 'Заказы у стойки выдаются сразу и здесь не показаны.';

const STATUS_NOTE = 'Статус заказа — на момент построения отчёта.';

const RATE_NOTE = 'Выдано, % — от заказов, чья судьба решена: оформленные без ждущих выдачи.';

const OFFICE_COLUMNS: ReportColumn[] = [
  { key: 'office', label: 'Офис', kind: 'text' },
  { key: 'created', label: 'Оформлено', kind: 'count' },
  { key: 'issued', label: 'Выдано', kind: 'count' },
  { key: 'cancelledByDriver', label: 'Отменил водитель', kind: 'count' },
  { key: 'cancelledByEmployee', label: 'Отменил сотрудник', kind: 'count' },
  { key: 'expired', label: 'Сгорело — не пришёл', kind: 'count' },
  { key: 'pending', label: 'Ждут выдачи', kind: 'count' },
  { key: 'issuedRate', label: 'Выдано, %', kind: 'count' },
];

const PRODUCT_COLUMNS: ReportColumn[] = [
  { key: 'product', label: 'Товар', kind: 'text' },
  { key: 'ordered', label: 'Заказано, шт', kind: 'count' },
  { key: 'issued', label: 'Выдано, шт', kind: 'count' },
  { key: 'expired', label: 'Сгорело, шт', kind: 'count' },
  { key: 'cancelled', label: 'Отменено, шт', kind: 'count' },
];

/** Доля выданных среди решённых, целым процентом. Решённых нет — значения нет, а не ноль. */
const issuedRate = (issued: number, created: number, pending: number): number | null => {
  const settled = created - pending;

  return settled === 0 ? null : Math.round((issued * 100) / settled);
};

const numberCell = (cell: ReportCell | undefined): number => (typeof cell === 'number' ? cell : 0);

const sumCells = (lines: ReportTableLine[], key: string): number =>
  lines.reduce((sum, line) => sum + numberCell(line.cells[key]), 0);

/** `Выдано, %` итога — от сумм колонок, а не среднее процентов строк. */
const OFFICE_AGGREGATES: ReportAggregates<ReportLine> = {
  issuedRate: (group) =>
    issuedRate(sumCells(group, 'issued'), sumCells(group, 'created'), sumCells(group, 'pending')),
};

const officeLine = (row: OrderOutcomeOfficeRow): ReportLine => {
  const officeLabel = archivedLabel(row.officeName, row.officeArchived);
  const created = Number(row.created);
  const issued = Number(row.issued);
  const pending = Number(row.pending);

  return {
    officeId: row.officeId,
    officeLabel,
    cells: {
      office: officeLabel,
      created,
      issued,
      cancelledByDriver: Number(row.cancelledByDriver),
      cancelledByEmployee: Number(row.cancelledByEmployee),
      expired: Number(row.expired),
      pending,
      issuedRate: issuedRate(issued, created, pending),
    },
  };
};

const productLine = (row: OrderOutcomeProductRow): ReportTableLine => ({
  cells: {
    product: productLabel(row.productName, row.productArchived),
    ordered: Number(row.ordered),
    issued: Number(row.issued),
    expired: Number(row.expired),
    cancelled: Number(row.cancelled),
  },
});

export const readOrderOutcomesReport = async (params: PeriodReportParams): Promise<ReportResult> => {
  const input = { from: params.from, to: params.to, officeId: params.office?.officeId ?? null };
  const [officeRows, productRows] = await Promise.all([
    listOrderOutcomesByOffice(input),
    listOrderOutcomesByProduct(input),
  ]);

  const sections: ReportSection[] = [
    {
      title: 'По офисам',
      columns: OFFICE_COLUMNS,
      // Строка — уже офис: `Итого: {офис}` повторил бы её, остаётся только `Итого`.
      rows: withTotals(officeRows.map(officeLine), OFFICE_COLUMNS, false, OFFICE_AGGREGATES),
      notes: [DESK_NOTE, STATUS_NOTE, RATE_NOTE],
    },
    {
      title: 'По товарам',
      columns: PRODUCT_COLUMNS,
      rows: withGroupTotals(productRows.map(productLine), PRODUCT_COLUMNS, {
        labelKey: 'product',
        group: null,
      }),
      notes: [],
    },
  ];

  return {
    report: 'order_outcomes',
    title: REPORT_TITLES.order_outcomes,
    subtitle: eventPeriodSubtitle(params, officeSubtitle(params.office), historyNote('заказов')),
    generatedAt: new Date().toISOString(),
    sections,
    empty: isEmptyReport(sections),
  };
};

/** Имя файла выгрузки: `Судьба заказов 01.09.2026–30.09.2026.xlsx`, с офисом через пробел. */
export const orderOutcomesReportFileName = (params: PeriodReportParams): string =>
  periodFileName('Судьба заказов', params);
