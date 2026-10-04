/**
 * Отчёт раздела «Отчёты» текстом в консоль, по всему парку (issue #372).
 *
 * Тонкая обвязка над сервисами: те же `read…Report`, что зовут ручки, — второй сборки отчёта
 * не существует. Нужна, чтобы снять цифры с копии боевой базы (`make copy-up`) без входа
 * в веб: на копии учётки боевые, и пароля к ним у локального стека нет.
 *
 * Запуск: make report-print report=points-economy from=2026-09-28 to=2026-10-04
 */
import { db } from '#server/db';
import { readPointsEconomyReport } from '#server/services/reports/readPointsEconomyReport';
import { readRewardsReport } from '#server/services/reports/readRewardsReport';
import { readSalesReport } from '#server/services/reports/readSalesReport';
import type { ReportCell, ReportResult, ReportSection } from '#shared/types/reports';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const READERS: Record<string, (from: string, to: string) => Promise<ReportResult>> = {
  'points-economy': (from, to) => readPointsEconomyReport({ from, to }),
  sales: (from, to) => readSalesReport({ from, to, office: null }),
  rewards: (from, to) => readRewardsReport({ from, to, office: null }),
};

const formatCell = (cell: ReportCell | undefined): string =>
  cell === null || cell === undefined ? '—' : String(cell);

const printSection = (section: ReportSection): void => {
  const header = section.columns.map((column) => column.label);
  const lines = section.rows.map((row) =>
    section.columns.map((column) => formatCell(row.cells[column.key])),
  );
  const widths = header.map((label, index) =>
    Math.max(label.length, ...lines.map((line) => line[index]!.length)),
  );
  const join = (cells: string[]): string =>
    cells.map((cell, index) => cell.padEnd(widths[index]!)).join(' | ');

  console.log(`\n## ${section.title}`);
  console.log(join(header));

  for (const line of lines) {
    console.log(join(line));
  }

  for (const note of section.notes) {
    console.log(`* ${note}`);
  }
};

const main = async (): Promise<void> => {
  const [report = '', from = '', to = ''] = process.argv.slice(2);
  const read = READERS[report];

  if (!read || !DAY_PATTERN.test(from) || !DAY_PATTERN.test(to)) {
    throw new Error(
      `make report-print report=<${Object.keys(READERS).join('|')}> from=ГГГГ-ММ-ДД to=ГГГГ-ММ-ДД`,
    );
  }

  const result = await read(from, to);

  console.log(`# ${result.title}\n${result.subtitle}`);
  result.sections.forEach(printSection);
};

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
