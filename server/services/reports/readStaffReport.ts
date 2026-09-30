import { listStaffLines, type StaffLineRow } from '#server/repositories/reports';
import type { PeriodReportParams } from '#server/services/reports/reportParams';
import {
  archivedLabel,
  eventPeriodSubtitle,
  historyNote,
  isEmptyReport,
  officeSubtitle,
  periodFileName,
  withGroupTotals,
  type ReportTableLine,
} from '#server/services/reports/reportTable';
import { EMPLOYEE_ROLE_LABELS } from '#shared/employeeRoles';
import { REPORT_TITLES } from '#shared/reports';
import type { ReportColumn, ReportResult, ReportSection } from '#shared/types/reports';

/**
 * «Работа сотрудников» (issue #310): кто сколько выдал, оформил у стойки, отменил и поправил —
 * по офисам, где это было.
 *
 * Строка — сотрудник × офис: у сотрудника, работавшего в двух офисах, две строки и свой итог.
 * В отчёт попадает строка, где за период хоть одно число не ноль, — это держит выборка:
 * строку рождает событие.
 */

const COLUMNS: ReportColumn[] = [
  { key: 'employee', label: 'Сотрудник', kind: 'text' },
  { key: 'role', label: 'Роль', kind: 'text' },
  { key: 'office', label: 'Офис', kind: 'text' },
  { key: 'issuedByCode', label: 'Выдал заказов по коду', kind: 'count' },
  { key: 'deskPoints', label: 'Оформил у стойки за баллы', kind: 'count' },
  { key: 'deskRetail', label: 'Оформил у стойки за розницу', kind: 'count' },
  { key: 'deskRetailSum', label: 'Розница, сум', kind: 'sum' },
  { key: 'rewardsIssued', label: 'Выдал наград', kind: 'count' },
  { key: 'ordersCancelled', label: 'Отменил заказов', kind: 'count' },
  { key: 'adjustments', label: 'Корректировок остатка', kind: 'count' },
];

type StaffLine = ReportTableLine & { employeeId: string; employeeName: string };

const staffLine = (row: StaffLineRow): StaffLine => ({
  employeeId: row.employeeId,
  employeeName: row.employeeName,
  cells: {
    employee: row.employeeName,
    role: EMPLOYEE_ROLE_LABELS[row.role],
    office: archivedLabel(row.officeName, row.officeArchived),
    issuedByCode: Number(row.issuedByCode),
    deskPoints: Number(row.deskPoints),
    deskRetail: Number(row.deskRetail),
    deskRetailSum: Number(row.deskRetailSum),
    rewardsIssued: Number(row.rewardsIssued),
    ordersCancelled: Number(row.ordersCancelled),
    adjustments: Number(row.adjustments),
  },
});

export const readStaffReport = async (params: PeriodReportParams): Promise<ReportResult> => {
  const rows = await listStaffLines({
    from: params.from,
    to: params.to,
    officeId: params.office?.officeId ?? null,
  });

  const sections: ReportSection[] = [
    {
      title: 'Работа сотрудников',
      columns: COLUMNS,
      // Итог по сотруднику — только у того, кто работал больше чем в одном офисе: у одной
      // строки итог повторил бы её же.
      rows: withGroupTotals(rows.map(staffLine), COLUMNS, {
        labelKey: 'employee',
        group: (line) => ({ id: line.employeeId, label: line.employeeName }),
        subtotal: (group) => group.length > 1,
      }),
      notes: [],
    },
  ];

  return {
    report: 'staff',
    title: REPORT_TITLES.staff,
    subtitle: eventPeriodSubtitle(
      params,
      officeSubtitle(params.office),
      historyNote('действий сотрудников'),
    ),
    generatedAt: new Date().toISOString(),
    sections,
    empty: isEmptyReport(sections),
  };
};

/** Имя файла выгрузки: `Работа сотрудников 01.09.2026–30.09.2026.xlsx`, с офисом через пробел. */
export const staffReportFileName = (params: PeriodReportParams): string =>
  periodFileName('Работа сотрудников', params);
