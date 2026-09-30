import ExcelJS from 'exceljs';

import { formatCalendarDate, formatClockTime } from '#server/utils/parkTime';
import type {
  ReportCell,
  ReportColumn,
  ReportResult,
  ReportRow,
  ReportSection,
} from '#shared/types/reports';

/**
 * Книга Excel из отчёта (issue #308) — из того же `ReportResult`, что рисует экран: цифры
 * в файле и на экране одни и те же по построению.
 *
 * Требование Руслана — кириллица без искажений и колонки без обрезанного текста. Кириллица
 * отдельной заботы не требует: `.xlsx` хранит текст в UTF-8 внутри XML, BOM и перекодировка
 * не нужны. Ширину Excel сам не подбирает — её считаем здесь.
 *
 * Раскладка листа: строка 1 — название отчёта, 2 — подпись и время, 3 — пустая, 4 — шапка,
 * дальше строки, под ними через пустую строку — примечания.
 */

const HEADER_ROW = 4;

/** Ширина колонки в символах: не уже, чтобы число не превращалось в `###`, и не шире экрана. */
const MIN_COLUMN_WIDTH = 8;
const MAX_COLUMN_WIDTH = 60;
const COLUMN_PADDING = 2;

/**
 * Ширина колонки по умолчанию у листа. `exceljs` считает ширину 9 умолчанием и колонку с ней
 * в файл не пишет, а Excel без явного умолчания рисует такую колонку своими 8,43 — посчитанные
 * 9 символов превратились бы в чужие. Явное умолчание листа делает их теми же 9.
 */
const SHEET_DEFAULT_COLUMN_WIDTH = 9;

/** Excel режет имя листа на 31 символе и не принимает `\ / ? * [ ] :`. */
const SHEET_NAME_MAX_LENGTH = 31;
const SHEET_NAME_FORBIDDEN = /[\\/?*[\]:]/g;

/** Разделитель разрядов подставляет Excel по локали того, кто открыл файл. */
const NUMBER_FORMAT = '#,##0';

/** Длина числа с разделителями разрядов — такой её увидят в ячейке. */
const GROUPED_NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE2E8F0' },
};

/**
 * Заливка строки `Итого: {офис}` — светлее шапки и другим тоном: офис в листе отделяется так же,
 * как на экране, но без пустых строк — они ломали бы автофильтр и выделение столбца.
 */
const SUBTOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF1F5F9' },
};

const THIN: Partial<ExcelJS.Border> = { style: 'thin' };

const sheetName = (title: string, index: number): string => {
  const cleaned = title.replace(SHEET_NAME_FORBIDDEN, ' ').trim().slice(0, SHEET_NAME_MAX_LENGTH).trim();

  return cleaned === '' ? `Лист ${index + 1}` : cleaned;
};

/** Сколько символов займёт значение в ячейке. */
const displayLength = (column: ReportColumn, value: ReportCell | undefined): number => {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number' && column.kind !== 'text') {
    return GROUPED_NUMBER.format(value).length;
  }

  return String(value).length;
};

/** Ширина по самому длинному значению колонки, шапка тоже в счёт. */
const columnWidth = (column: ReportColumn, rows: ReportRow[]): number => {
  const longest = rows.reduce(
    (max, row) => Math.max(max, displayLength(column, row.cells[column.key])),
    column.label.length,
  );

  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, longest + COLUMN_PADDING));
};

const addSectionSheet = (
  workbook: ExcelJS.Workbook,
  result: ReportResult,
  section: ReportSection,
  index: number,
  generated: string,
): void => {
  const sheet = workbook.addWorksheet(sheetName(section.title, index), {
    views: [{ state: 'frozen', ySplit: HEADER_ROW }],
    properties: { defaultColWidth: SHEET_DEFAULT_COLUMN_WIDTH },
  });

  sheet.columns = section.columns.map((column) => ({
    key: column.key,
    width: columnWidth(column, section.rows),
  }));

  const titleCell = sheet.getCell(1, 1);
  titleCell.value = result.title;
  titleCell.font = { bold: true, size: 14 };

  sheet.getCell(2, 1).value = `${result.subtitle} · Сформирован ${generated}`;

  const header = sheet.getRow(HEADER_ROW);
  section.columns.forEach((column, columnIndex) => {
    const cell = header.getCell(columnIndex + 1);
    cell.value = column.label;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = { bottom: THIN };
  });

  section.rows.forEach((row, rowIndex) => {
    const sheetRow = sheet.getRow(HEADER_ROW + 1 + rowIndex);

    section.columns.forEach((column, columnIndex) => {
      const cell = sheetRow.getCell(columnIndex + 1);
      const value = row.cells[column.key] ?? null;

      // `null` — пустая ячейка: «значения нет», а не ноль и не прочерк текстом.
      if (value !== null) {
        cell.value = value;
      }

      if (column.kind !== 'text') {
        cell.numFmt = NUMBER_FORMAT;
      } else if (typeof value === 'string' && value.length > MAX_COLUMN_WIDTH) {
        // Колонка упёрлась в потолок ширины — длинный текст переносится, а не режется.
        cell.alignment = { wrapText: true, vertical: 'top' };
      }

      if (row.kind !== 'row') {
        cell.font = { bold: true };
      }

      if (row.kind === 'subtotal') {
        cell.fill = SUBTOTAL_FILL;
        cell.border = { bottom: THIN };
      }

      if (row.kind === 'total') {
        cell.border = { top: THIN };
      }
    });
  });

  const lastRow = HEADER_ROW + section.rows.length;

  sheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: lastRow, column: section.columns.length },
  };

  section.notes.forEach((note, noteIndex) => {
    const cell = sheet.getCell(lastRow + 2 + noteIndex, 1);
    cell.value = note;
    cell.font = { italic: true };
  });
};

export const buildReportWorkbook = async (result: ReportResult): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const generatedAt = new Date(result.generatedAt);
  const generated = `${formatCalendarDate(generatedAt)} ${formatClockTime(generatedAt)}`;

  workbook.created = generatedAt;
  workbook.title = result.title;

  result.sections.forEach((section, index) => {
    addSectionSheet(workbook, result, section, index, generated);
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
};
