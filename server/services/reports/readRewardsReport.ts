import type { RewardSource } from '#server/generated/prisma/enums';
import { listRewardLines, type RewardLineRow } from '#server/repositories/reports';
import type { PeriodReportParams } from '#server/services/reports/reportParams';
import {
  archivedLabel,
  countMissing,
  eventPeriodSubtitle,
  historyNote,
  isEmptyReport,
  joinNotes,
  missingCostNote,
  NO_COST_NOTE,
  officeSubtitle,
  periodFileName,
  productLabel,
  withTotals,
  type ReportLine,
} from '#server/services/reports/reportTable';
import { REPORT_TITLES } from '#shared/reports';
import type { ReportColumn, ReportResult, ReportSection } from '#shared/types/reports';

/**
 * «Награды и подарки» (issue #310): какой товар ушёл бесплатно по акциям, подаркам и ручным
 * наградам, во что он обошёлся и что не забрали.
 *
 * Только награды, которые занимают товар или выдаются в офисе, — товар и произвольная. Баллы-
 * награды и подарки баллами — перевод причиной `campaign`, их считает «Экономика балла».
 *
 * Себестоимость — снимок в награде на момент её создания (issue #372), а не текущая цена
 * каталога. У произвольной награды её нет по устройству: это не товар из каталога.
 */

const COST_NOTE =
  'Себестоимость — на момент заказа или награды; у выданного до снимка — по цене каталога на день, когда снимок заведён.';

const RETURNED_NOTE = 'Товар несгоревших наград вернулся в остаток офиса.';

const CUSTOM_NOTE = 'произвольная награда';

const SOURCE_LABELS: Record<RewardSource, string> = {
  campaign: 'Акция',
  gift: 'Подарок',
  manual: 'Вручную',
};

const COLUMNS: ReportColumn[] = [
  { key: 'office', label: 'Офис', kind: 'text' },
  { key: 'reward', label: 'Награда', kind: 'text' },
  { key: 'source', label: 'Источник', kind: 'text' },
  { key: 'quantity', label: 'Штук', kind: 'count' },
  { key: 'cost', label: 'Себестоимость, сум', kind: 'sum' },
  { key: 'note', label: 'Примечание', kind: 'text' },
];

const rewardLine = (row: RewardLineRow): ReportLine => {
  const officeLabel = archivedLabel(row.officeName, row.officeArchived);
  const quantity = Number(row.quantity);
  const isCustom = row.kind === 'custom';
  const cost = isCustom || row.cost === null ? null : Number(row.cost);

  return {
    officeId: row.officeId,
    officeLabel,
    cells: {
      office: officeLabel,
      reward: isCustom ? (row.customTitle ?? '') : productLabel(row.productName, row.productArchived),
      source: SOURCE_LABELS[row.source],
      quantity,
      cost,
      note: joinNotes([isCustom && CUSTOM_NOTE, !isCustom && cost === null && NO_COST_NOTE]),
    },
  };
};

const section = (
  title: string,
  rows: RewardLineRow[],
  perOffice: boolean,
  extraNotes: string[],
): ReportSection => {
  const lines = rows.map(rewardLine);
  const missingCost = countMissing(lines, 'cost');

  return {
    title,
    columns: COLUMNS,
    rows: withTotals(lines, COLUMNS, perOffice),
    notes: [...extraNotes, ...(missingCost > 0 ? [missingCostNote(missingCost)] : []), COST_NOTE],
  };
};

export const readRewardsReport = async (params: PeriodReportParams): Promise<ReportResult> => {
  const rows = await listRewardLines({
    from: params.from,
    to: params.to,
    officeId: params.office?.officeId ?? null,
  });
  const perOffice = params.office === null;

  const sections = [
    section(
      'Выдано',
      rows.filter((row) => row.status === 'issued'),
      perOffice,
      [],
    ),
    section(
      'Не забрали',
      rows.filter((row) => row.status === 'expired'),
      perOffice,
      [RETURNED_NOTE],
    ),
  ];

  return {
    report: 'rewards',
    title: REPORT_TITLES.rewards,
    subtitle: eventPeriodSubtitle(params, officeSubtitle(params.office), historyNote('наград')),
    generatedAt: new Date().toISOString(),
    sections,
    empty: isEmptyReport(sections),
  };
};

/** Имя файла выгрузки: `Награды 01.09.2026–30.09.2026.xlsx`, с офисом через пробел. */
export const rewardsReportFileName = (params: PeriodReportParams): string =>
  periodFileName('Награды', params);
