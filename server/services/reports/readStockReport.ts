import { listStockLines, readStockMoment, type StockLineRow } from '#server/repositories/reports';
import type { StockReportParams } from '#server/services/reports/reportParams';
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
  type ReportLine,
} from '#server/services/reports/reportTable';
import { formatCalendarDate, formatClockTime } from '#server/utils/parkTime';
import { REPORT_TITLES } from '#shared/reports';
import type { ReportColumn, ReportResult, ReportSection } from '#shared/types/reports';

/**
 * «Остатки на дату» (issue #308): что лежит в офисах на конец суток, по офисам и товарам.
 *
 * Остаток на прошлую дату — сумма журнала движений до момента, а не кэш `office_stock`:
 * кэш знает только «сейчас». `on_hand` в журнале — свободный остаток, а не весь товар
 * в офисе: резерв снимает штуку из свободного в отложенное, выдача — из отложенного. Поэтому
 * физически в офисе — свободное плюс резерв, и оценка склада считается от этой суммы.
 *
 * Цены — текущие из каталога, как и в продажах: истории цен нет.
 */

const PRICES_NOTE = 'Себестоимость и розница — по текущим ценам товара в каталоге.';

const NO_RETAIL_NOTE = 'нет розничной цены';

const missingRetailNote = (count: number): string =>
  `В рознице без учёта позиций без розничной цены: ${count}`;

const COLUMNS: ReportColumn[] = [
  { key: 'office', label: 'Офис', kind: 'text' },
  { key: 'product', label: 'Товар', kind: 'text' },
  { key: 'total', label: 'Всего в офисе', kind: 'count' },
  { key: 'reserved', label: 'В резерве', kind: 'count' },
  { key: 'free', label: 'Свободно', kind: 'count' },
  { key: 'cost', label: 'Себестоимость, сум', kind: 'sum' },
  { key: 'retail', label: 'В рознице, сум', kind: 'sum' },
  { key: 'note', label: 'Примечание', kind: 'text' },
];

const stockLine = (row: StockLineRow): ReportLine => {
  const free = Number(row.free);
  const reserved = Number(row.reserved);
  const total = free + reserved;
  const officeLabel = archivedLabel(row.officeName, row.officeArchived);

  return {
    officeId: row.officeId,
    officeLabel,
    cells: {
      office: officeLabel,
      product: productLabel(row.productName, row.productArchived),
      total,
      reserved,
      free,
      cost: row.priceCost === null ? null : total * row.priceCost,
      retail: row.priceRetail === null ? null : total * row.priceRetail,
      note: joinNotes([row.priceCost === null && NO_COST_NOTE, row.priceRetail === null && NO_RETAIL_NOTE]),
    },
  };
};

export const readStockReport = async (params: StockReportParams): Promise<ReportResult> => {
  const { moment, dayEnd } = await readStockMoment(params.date);
  const rows = await listStockLines({ moment, officeId: params.office?.officeId ?? null });
  const lines = rows.map(stockLine);

  const missingCost = countMissing(lines, 'cost');
  const missingRetail = countMissing(lines, 'retail');

  const sections: ReportSection[] = [
    {
      title: 'Остатки',
      columns: COLUMNS,
      rows: withTotals(lines, COLUMNS, params.office === null),
      notes: [
        ...(missingCost > 0 ? [missingCostNote(missingCost)] : []),
        ...(missingRetail > 0 ? [missingRetailNote(missingRetail)] : []),
        PRICES_NOTE,
      ],
    },
  ];

  // Сутки ещё не кончились — остаток на сейчас, и подпись говорит это, а не 00:00 завтрашнего дня.
  const at =
    moment.getTime() < dayEnd.getTime()
      ? `сейчас, ${formatClockTime(moment)}`
      : `конец суток, ${formatClockTime(dayEnd)} ${formatCalendarDate(dayEnd)} по Ташкенту`;

  return {
    report: 'stock',
    title: REPORT_TITLES.stock,
    subtitle: `На ${formatReportDay(params.date)} — ${at} · ${officeSubtitle(params.office)} · сутки по Ташкенту`,
    generatedAt: new Date().toISOString(),
    sections,
    empty: isEmptyReport(sections),
  };
};

/** Имя файла выгрузки: `Остатки на 30.09.2026.xlsx`, с офисом через пробел. */
export const stockReportFileName = (params: StockReportParams): string =>
  ['Остатки на', formatReportDay(params.date), ...(params.office ? [params.office.name] : [])].join(' ') +
  '.xlsx';
