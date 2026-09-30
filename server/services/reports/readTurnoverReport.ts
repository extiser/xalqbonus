import { consola } from 'consola';
import { listTurnoverLines, readPeriodMoments, type TurnoverLineRow } from '#server/repositories/reports';
import type { PeriodReportParams } from '#server/services/reports/reportParams';
import {
  archivedLabel,
  countMissing,
  formatReportDay,
  isEmptyReport,
  joinNotes,
  missingCostNote,
  NO_COST_NOTE,
  periodSubtitle,
  productLabel,
  STOCK_HISTORY_NOTE,
  withTotals,
  type ReportLine,
} from '#server/services/reports/reportTable';
import { REPORT_TITLES } from '#shared/reports';
import type { ReportColumn, ReportResult, ReportSection } from '#shared/types/reports';

/**
 * «Движение товара» (issue #309) — оборотная ведомость: по офису и товару за период сколько
 * было в офисе на начало, сколько пришло, сколько ушло и куда, сколько осталось.
 *
 * «Всего в офисе» — свободный остаток плюс резерв: резерв и его снятие товар из офиса
 * не выносят, поэтому отдельных колонок у них нет. Уходит товар только выдачей.
 *
 * **Начало, движение и конец обязаны сходиться.** Выборка считает начало и конец суммой
 * журнала сами по себе, движение — по видам; здесь они сверяются построчно. Расхождение
 * значит, что в журнале есть движение, которого раскладка по видам не знает, — строка
 * остаётся, расхождение пишется в примечание, в примечание раздела и в лог.
 */

const log = consola.withTag('reports:turnover');

const COST_NOTE = 'Себестоимость — по текущей цене товара в каталоге.';

const RESERVE_NOTE =
  'Резерв и его снятие товар из офиса не выносят и здесь не показаны: уходит товар только выдачей.';

const mismatchNote = (count: number): string =>
  `Строк, где остатки не сходятся с движением: ${count} — сообщите разработчику.`;

const COLUMNS: ReportColumn[] = [
  { key: 'office', label: 'Офис', kind: 'text' },
  { key: 'product', label: 'Товар', kind: 'text' },
  { key: 'opening', label: 'На начало', kind: 'count' },
  { key: 'incoming', label: 'Приход', kind: 'count' },
  { key: 'adjustmentPlus', label: 'Корректировка +', kind: 'count' },
  { key: 'adjustmentMinus', label: 'Корректировка −', kind: 'count' },
  { key: 'issuedPoints', label: 'Выдано за баллы', kind: 'count' },
  { key: 'issuedRetail', label: 'Продано за розницу', kind: 'count' },
  { key: 'issuedRewards', label: 'Выдано наградами', kind: 'count' },
  { key: 'closing', label: 'На конец', kind: 'count' },
  { key: 'closingReserved', label: 'Из них в резерве', kind: 'count' },
  { key: 'cost', label: 'Себестоимость на конец, сум', kind: 'sum' },
  { key: 'note', label: 'Примечание', kind: 'text' },
];

/** Строка ведомости и её расхождение: ноль — начало, движение и конец сходятся. */
type TurnoverLine = ReportLine & { mismatch: number };

const turnoverLine = (row: TurnoverLineRow): TurnoverLine => {
  const opening = Number(row.opening);
  const incoming = Number(row.incoming);
  const adjustmentPlus = Number(row.adjustmentPlus);
  const adjustmentMinus = Number(row.adjustmentMinus);
  const issuedPoints = Number(row.issuedPoints);
  const issuedRetail = Number(row.issuedRetail);
  const issuedRewards = Number(row.issuedRewards);
  const closing = Number(row.closing);

  const expected =
    opening + incoming + adjustmentPlus - adjustmentMinus - issuedPoints - issuedRetail - issuedRewards;
  const mismatch = closing - expected;
  const officeLabel = archivedLabel(row.officeName, row.officeArchived);
  const product = productLabel(row.productName, row.productArchived);

  if (mismatch !== 0) {
    log.error('остатки не сходятся с движением', {
      officeId: row.officeId,
      office: row.officeName,
      productId: row.productId,
      product: row.productName,
      opening,
      incoming,
      adjustmentPlus,
      adjustmentMinus,
      issuedPoints,
      issuedRetail,
      issuedRewards,
      closing,
      expected,
      mismatch,
    });
  }

  return {
    officeId: row.officeId,
    officeLabel,
    mismatch,
    cells: {
      office: officeLabel,
      product,
      opening,
      incoming,
      adjustmentPlus,
      adjustmentMinus,
      issuedPoints,
      issuedRetail,
      issuedRewards,
      closing,
      closingReserved: Number(row.closingReserved),
      cost: row.priceCost === null ? null : closing * row.priceCost,
      note: joinNotes([
        row.priceCost === null && NO_COST_NOTE,
        mismatch !== 0 && `не сходится: разница ${mismatch}`,
      ]),
    },
  };
};

export const readTurnoverReport = async (params: PeriodReportParams): Promise<ReportResult> => {
  const moments = await readPeriodMoments({ from: params.from, to: params.to });
  const rows = await listTurnoverLines({
    start: moments.start,
    end: moments.end,
    officeId: params.office?.officeId ?? null,
  });
  const lines = rows.map(turnoverLine);

  const mismatches = lines.filter((line) => line.mismatch !== 0).length;
  const missingCost = countMissing(lines, 'cost');

  const sections: ReportSection[] = [
    {
      title: 'Движение товара',
      columns: COLUMNS,
      rows: withTotals(lines, COLUMNS, params.office === null),
      notes: [
        ...(mismatches > 0 ? [mismatchNote(mismatches)] : []),
        ...(missingCost > 0 ? [missingCostNote(missingCost)] : []),
        COST_NOTE,
        RESERVE_NOTE,
      ],
    },
  ];

  return {
    report: 'turnover',
    title: REPORT_TITLES.turnover,
    subtitle: periodSubtitle(params, moments, STOCK_HISTORY_NOTE),
    generatedAt: new Date().toISOString(),
    sections,
    empty: isEmptyReport(sections),
  };
};

/** Имя файла выгрузки: `Движение товара 01.09.2026–30.09.2026.xlsx`, с офисом через пробел. */
export const turnoverReportFileName = (params: PeriodReportParams): string =>
  [
    'Движение товара',
    `${formatReportDay(params.from)}–${formatReportDay(params.to)}`,
    ...(params.office ? [params.office.name] : []),
  ].join(' ') + '.xlsx';
