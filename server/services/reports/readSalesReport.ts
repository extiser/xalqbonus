import { listSalesLines, type SalesLineRow } from '#server/repositories/reports';
import type { PeriodReportParams } from '#server/services/reports/reportParams';
import {
  archivedLabel,
  countMissing,
  formatReportDay,
  isEmptyReport,
  joinNotes,
  missingCostNote,
  NO_COST_NOTE,
  officeSubtitle,
  productLabel,
  withTotals,
  type ReportAggregates,
  type ReportLine,
} from '#server/services/reports/reportTable';
import { REPORT_TITLES, REPORTS_HISTORY_START } from '#shared/reports';
import type { ReportColumn, ReportResult, ReportSection } from '#shared/types/reports';

/**
 * «Продажи за период» (issue #308): что выдано за баллы и что за розницу, по офисам и товарам.
 *
 * Продажа — по выдаче, сутки — с 05:00 по Ташкенту, демо не входит: всё это решает выборка
 * (`listSalesLines`). Здесь — раскладка по разделам, себестоимость и итоги.
 *
 * Себестоимость — текущая цена каталога: в позиции заказа её снимка нет. Товар без
 * себестоимости не прячется и нулём не считается — пустая ячейка и причина в примечании.
 */

const COST_NOTE = 'Себестоимость — по текущей цене товара в каталоге.';

const HISTORY_NOTE = `Данные — с ${formatReportDay(REPORTS_HISTORY_START)}: продаж старого бота в системе нет.`;

const POINTS_COLUMNS: ReportColumn[] = [
  { key: 'office', label: 'Офис', kind: 'text' },
  { key: 'product', label: 'Товар', kind: 'text' },
  { key: 'quantity', label: 'Штук', kind: 'count' },
  { key: 'points', label: 'Баллов', kind: 'points' },
  { key: 'orders', label: 'Заказов', kind: 'count' },
  { key: 'cost', label: 'Себестоимость, сум', kind: 'sum' },
  { key: 'note', label: 'Примечание', kind: 'text' },
];

const RETAIL_COLUMNS: ReportColumn[] = [
  { key: 'office', label: 'Офис', kind: 'text' },
  { key: 'product', label: 'Товар', kind: 'text' },
  { key: 'quantity', label: 'Штук', kind: 'count' },
  { key: 'revenue', label: 'Выручка, сум', kind: 'sum' },
  { key: 'orders', label: 'Заказов', kind: 'count' },
  { key: 'cost', label: 'Себестоимость, сум', kind: 'sum' },
  { key: 'profit', label: 'Валовая прибыль, сум', kind: 'sum' },
  { key: 'note', label: 'Примечание', kind: 'text' },
];

/** Строка продаж: заказы при ней — для итога «Заказов» по различным заказам. */
type SalesLine = ReportLine & { orderIds: string[] };

const SALES_AGGREGATES: ReportAggregates<SalesLine> = {
  orders: (group) => new Set(group.flatMap((line) => line.orderIds)).size,
};

/** Себестоимость строки: штуки × текущая цена. Цены нет — значения нет. */
const lineCost = (row: SalesLineRow): number | null =>
  row.priceCost === null ? null : Number(row.quantity) * row.priceCost;

const lineHead = (row: SalesLineRow): Omit<SalesLine, 'cells'> => ({
  officeId: row.officeId,
  officeLabel: archivedLabel(row.officeName, row.officeArchived),
  orderIds: row.orderIds,
});

const pointsLine = (row: SalesLineRow): SalesLine => {
  const cost = lineCost(row);

  return {
    ...lineHead(row),
    cells: {
      office: archivedLabel(row.officeName, row.officeArchived),
      product: productLabel(row.productName, false),
      quantity: Number(row.quantity),
      points: Number(row.points ?? 0n),
      orders: row.orderIds.length,
      cost,
      note: joinNotes([cost === null && NO_COST_NOTE]),
    },
  };
};

const retailLine = (row: SalesLineRow): SalesLine => {
  const cost = lineCost(row);
  const revenue = Number(row.retail ?? 0n);

  return {
    ...lineHead(row),
    cells: {
      office: archivedLabel(row.officeName, row.officeArchived),
      product: productLabel(row.productName, false),
      quantity: Number(row.quantity),
      revenue,
      orders: row.orderIds.length,
      cost,
      profit: cost === null ? null : revenue - cost,
      note: joinNotes([cost === null && NO_COST_NOTE]),
    },
  };
};

const section = (
  title: string,
  columns: ReportColumn[],
  lines: SalesLine[],
  perOffice: boolean,
): ReportSection => {
  const missingCost = countMissing(lines, 'cost');

  return {
    title,
    columns,
    rows: withTotals(lines, columns, perOffice, SALES_AGGREGATES),
    notes: [...(missingCost > 0 ? [missingCostNote(missingCost)] : []), COST_NOTE],
  };
};

export const readSalesReport = async (params: PeriodReportParams): Promise<ReportResult> => {
  const rows = await listSalesLines({
    from: params.from,
    to: params.to,
    officeId: params.office?.officeId ?? null,
  });
  const perOffice = params.office === null;

  const sections = [
    section(
      'За баллы',
      POINTS_COLUMNS,
      rows.filter((row) => row.payment === 'points').map(pointsLine),
      perOffice,
    ),
    section(
      'За розницу',
      RETAIL_COLUMNS,
      rows.filter((row) => row.payment === 'retail').map(retailLine),
      perOffice,
    ),
  ];

  const period = `${formatReportDay(params.from)}–${formatReportDay(params.to)}`;
  const subtitle = `${period} · ${officeSubtitle(params.office)} · сутки с 05:00 по Ташкенту`;

  return {
    report: 'sales',
    title: REPORT_TITLES.sales,
    subtitle: params.from < REPORTS_HISTORY_START ? `${subtitle}. ${HISTORY_NOTE}` : subtitle,
    generatedAt: new Date().toISOString(),
    sections,
    empty: isEmptyReport(sections),
  };
};

/** Имя файла выгрузки: `Продажи 01.09.2026–30.09.2026.xlsx`, с офисом через пробел. */
export const salesReportFileName = (params: PeriodReportParams): string =>
  [
    'Продажи',
    `${formatReportDay(params.from)}–${formatReportDay(params.to)}`,
    ...(params.office ? [params.office.name] : []),
  ].join(' ') + '.xlsx';
