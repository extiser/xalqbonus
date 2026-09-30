import { listAdjustments, readPeriodMoments, type AdjustmentRow } from '#server/repositories/reports';
import type { PeriodReportParams } from '#server/services/reports/reportParams';
import {
  archivedLabel,
  formatReportDay,
  isEmptyReport,
  joinNotes,
  NO_COST_NOTE,
  periodSubtitle,
  productLabel,
  STOCK_HISTORY_NOTE,
  withTotals,
  type ReportLine,
} from '#server/services/reports/reportTable';
import { formatCalendarDate, formatClockTime } from '#server/utils/parkTime';
import { REPORT_TITLES } from '#shared/reports';
import type { ReportColumn, ReportResult, ReportSection } from '#shared/types/reports';

/**
 * «Корректировки остатков» (issue #309): ручные правки остатка за период — кто, когда,
 * сколько и с какой заметкой. Контроль недостач и списаний.
 *
 * Это список событий, а не свод: строк `Итого: {офис}` нет, есть только `Итого` раздела —
 * суммы со знаком. Прибавленное и списанное порознь — в примечаниях раздела: итог со знаком
 * «+5 −5 = 0» спрятал бы и недостачу, и пересчёт, который её закрыл.
 *
 * Себестоимость — текущая цена каталога, как во всех отчётах раздела.
 */

const COST_NOTE = 'Себестоимость — по текущей цене товара в каталоге.';

const COLUMNS: ReportColumn[] = [
  { key: 'createdAt', label: 'Когда', kind: 'text' },
  { key: 'office', label: 'Офис', kind: 'text' },
  { key: 'product', label: 'Товар', kind: 'text' },
  { key: 'delta', label: 'Изменение', kind: 'count' },
  { key: 'cost', label: 'Себестоимость, сум', kind: 'sum' },
  { key: 'employee', label: 'Сотрудник', kind: 'text' },
  { key: 'comment', label: 'Заметка', kind: 'text' },
  { key: 'note', label: 'Примечание', kind: 'text' },
];

/** Сумма в примечании — с разрядами, как её показывает таблица. */
const GROUPED_NUMBER = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

const adjustmentLine = (row: AdjustmentRow): ReportLine => {
  const officeLabel = archivedLabel(row.officeName, row.officeArchived);

  return {
    officeId: row.officeId,
    officeLabel,
    cells: {
      createdAt: `${formatCalendarDate(row.createdAt)} ${formatClockTime(row.createdAt)}`,
      office: officeLabel,
      product: productLabel(row.productName, row.productArchived),
      delta: row.delta,
      cost: row.priceCost === null ? null : row.delta * row.priceCost,
      employee: row.employeeName ?? '',
      comment: row.note ?? '',
      note: joinNotes([row.priceCost === null && NO_COST_NOTE]),
    },
  };
};

/**
 * Строка примечания по одной стороне правок: `Прибавлено: 5 шт., на 50 000 сум`. Штуки
 * и сумма — по модулю: знак уже сказан словом. Правки без себестоимости в сумму не входят,
 * и их число стоит в скобках.
 */
const sideNote = (label: string, rows: AdjustmentRow[]): string => {
  const quantity = rows.reduce((sum, row) => sum + Math.abs(row.delta), 0);
  const priced = rows.filter((row) => row.priceCost !== null);
  const cost = priced.reduce((sum, row) => sum + Math.abs(row.delta) * (row.priceCost ?? 0), 0);
  const missing = rows.length - priced.length;
  const missingText = missing > 0 ? ` (без учёта позиций без себестоимости: ${missing})` : '';

  return `${label}: ${GROUPED_NUMBER.format(quantity)} шт., на ${GROUPED_NUMBER.format(cost)} сум${missingText}`;
};

export const readAdjustmentsReport = async (params: PeriodReportParams): Promise<ReportResult> => {
  const moments = await readPeriodMoments({ from: params.from, to: params.to });
  const rows = await listAdjustments({
    start: moments.start,
    end: moments.end,
    officeId: params.office?.officeId ?? null,
  });

  const sections: ReportSection[] = [
    {
      title: 'Корректировки',
      columns: COLUMNS,
      rows: withTotals(rows.map(adjustmentLine), COLUMNS, false),
      notes: [
        sideNote('Прибавлено', rows.filter((row) => row.delta > 0)),
        sideNote('Списано', rows.filter((row) => row.delta < 0)),
        COST_NOTE,
      ],
    },
  ];

  return {
    report: 'adjustments',
    title: REPORT_TITLES.adjustments,
    subtitle: periodSubtitle(params, moments, STOCK_HISTORY_NOTE),
    generatedAt: new Date().toISOString(),
    sections,
    empty: isEmptyReport(sections),
  };
};

/** Имя файла выгрузки: `Корректировки 01.09.2026–30.09.2026.xlsx`, с офисом через пробел. */
export const adjustmentsReportFileName = (params: PeriodReportParams): string =>
  [
    'Корректировки',
    `${formatReportDay(params.from)}–${formatReportDay(params.to)}`,
    ...(params.office ? [params.office.name] : []),
  ].join(' ') + '.xlsx';
