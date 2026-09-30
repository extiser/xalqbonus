import {
  listPointReasonLines,
  listSalesLines,
  readDriverBalancesTotal,
  type PointReasonLineRow,
} from '#server/repositories/reports';
import type { ParkPeriodReportParams } from '#server/services/reports/reportParams';
import {
  eventPeriodSubtitle,
  historyNote,
  isEmptyReport,
  missingCostNote,
  PARK_WIDE_SUBTITLE,
  periodFileName,
  withGroupTotals,
  type ReportTableLine,
} from '#server/services/reports/reportTable';
import { POINT_REASON_LABELS } from '#shared/pointReasons';
import { REPORT_TITLES } from '#shared/reports';
import type { ReportColumn, ReportResult, ReportRow, ReportSection } from '#shared/types/reports';

/**
 * «Экономика балла» (issue #310): сколько баллов водители получили и отдали за период
 * и во что парку обходится один балл.
 *
 * Отчёт по всему парку: баллы офису не принадлежат, и офис фильтра ручка не принимает.
 *
 * Цена балла — оценка: себестоимость товара, выданного за баллы в периоде, делённая
 * на списанные за него баллы. Себестоимость — текущая цена каталога, как во всех отчётах
 * раздела; позиции без неё в цену не входят ни себестоимостью, ни баллами — иначе они
 * удешевляли бы балл своими баллами при нулевой себестоимости.
 *
 * Выданное за баллы берётся той же выборкой, что «Продажи за период» по всем офисам: строка
 * «Списано баллов за выданный товар» равна итогу раздела «За баллы» по построению.
 */

const CAMPAIGN_NOTE = 'Подарки баллами и призы акций — в строке «акция».';

const PRICE_NOTE =
  'Цена балла — оценка по текущей себестоимости товара, выданного за период: себестоимость ÷ списанные за него баллы.';

const BALANCE_NOTE = 'Баллы на руках — на момент построения отчёта, а не на конец периода.';

const REASON_COLUMNS: ReportColumn[] = [
  { key: 'reason', label: 'Причина', kind: 'text' },
  { key: 'received', label: 'Получили водители', kind: 'points' },
  { key: 'spent', label: 'Ушло с водителей', kind: 'points' },
  { key: 'net', label: 'Итого для водителей', kind: 'points' },
];

const PRICE_COLUMNS: ReportColumn[] = [
  { key: 'indicator', label: 'Показатель', kind: 'text' },
  { key: 'value', label: 'Значение', kind: 'points' },
];

const reasonLine = (row: PointReasonLineRow): ReportTableLine => {
  const received = Number(row.received);
  const spent = Number(row.spent);

  return {
    cells: {
      reason: POINT_REASON_LABELS[row.reason],
      received,
      spent,
      net: received - spent,
    },
  };
};

const indicatorRow = (indicator: string, value: number | null): ReportRow => ({
  cells: { indicator, value },
  kind: 'row',
});

/** Цена балла и то, из чего она сложена. */
type PointPrice = {
  spentPoints: number;
  cost: number;
  unpricedCount: number;
  /** Сум за балл, целым. `null` — позиций с себестоимостью нет. */
  pointCost: number | null;
};

const readPointPrice = async (params: ParkPeriodReportParams): Promise<PointPrice> => {
  const lines = (await listSalesLines({ from: params.from, to: params.to, officeId: null })).filter(
    (line) => line.payment === 'points',
  );

  let spentPoints = 0;
  let cost = 0;
  let pricedPoints = 0;
  let unpricedCount = 0;

  for (const line of lines) {
    const points = Number(line.points ?? 0n);

    spentPoints += points;

    if (line.priceCost === null) {
      unpricedCount += 1;
    } else {
      cost += Number(line.quantity) * line.priceCost;
      pricedPoints += points;
    }
  }

  return {
    spentPoints,
    cost,
    unpricedCount,
    pointCost: pricedPoints === 0 ? null : Math.round(cost / pricedPoints),
  };
};

export const readPointsEconomyReport = async (
  params: ParkPeriodReportParams,
): Promise<ReportResult> => {
  const [reasonRows, price, balances] = await Promise.all([
    listPointReasonLines(params),
    readPointPrice(params),
    readDriverBalancesTotal(),
  ]);
  const onHand = Number(balances);

  const reasonSection: ReportSection = {
    title: 'Баллы за период',
    columns: REASON_COLUMNS,
    rows: withGroupTotals(reasonRows.map(reasonLine), REASON_COLUMNS, {
      labelKey: 'reason',
      group: null,
    }),
    notes: [CAMPAIGN_NOTE],
  };

  const priceSection: ReportSection = {
    title: 'Цена балла',
    columns: PRICE_COLUMNS,
    rows: [
      indicatorRow('Списано баллов за выданный товар', price.spentPoints),
      indicatorRow('Себестоимость этого товара, сум', price.cost),
      indicatorRow('Позиций без себестоимости', price.unpricedCount),
      indicatorRow('Один балл обходится парку, сум', price.pointCost),
      indicatorRow('Баллов на руках у водителей сейчас', onHand),
      indicatorRow(
        'Оценка: во что обойдутся баллы на руках, сум',
        price.pointCost === null ? null : onHand * price.pointCost,
      ),
    ],
    notes: [
      PRICE_NOTE,
      BALANCE_NOTE,
      ...(price.unpricedCount > 0 ? [missingCostNote(price.unpricedCount)] : []),
    ],
  };

  return {
    report: 'points_economy',
    title: REPORT_TITLES.points_economy,
    subtitle: eventPeriodSubtitle(params, PARK_WIDE_SUBTITLE, historyNote('переводов баллов')),
    generatedAt: new Date().toISOString(),
    sections: [reasonSection, priceSection],
    // Строки «Цены балла» есть всегда — баллы на руках не бывают «за период». Пуст отчёт,
    // когда за период не было ни перевода, ни товара, выданного за баллы.
    empty: isEmptyReport([reasonSection]) && price.spentPoints === 0,
  };
};

/** Имя файла выгрузки: `Экономика балла 01.09.2026–30.09.2026.xlsx`. */
export const pointsEconomyReportFileName = (params: ParkPeriodReportParams): string =>
  periodFileName('Экономика балла', params);
