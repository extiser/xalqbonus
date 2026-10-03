import type { ReportKey } from '../reports';

/**
 * Модель отчёта — одна на экран и на Excel (issue #308).
 *
 * Сервер собирает отчёт один раз, и оба выхода рисуют одно и то же: экран — таблицей,
 * выгрузка — книгой. Цифры в файле и на экране совпадают по построению, а не проверкой.
 */

/**
 * Вид колонки. `count` — штуки, `points` — баллы, `sum` — сумы: все три — целые числа
 * и выравниваются вправо; `text` — строка.
 */
export type ReportColumnKind = 'text' | 'count' | 'points' | 'sum';

export type ReportColumn = { key: string; label: string; kind: ReportColumnKind };

/** `null` в числовой ячейке — «значения нет» (себестоимость), а не ноль. */
export type ReportCell = string | number | null;

export type ReportRow = {
  cells: Record<string, ReportCell>;
  /** `subtotal` — «Итого по офису», `total` — итог раздела. */
  kind: 'row' | 'subtotal' | 'total';
};

export type ReportSection = {
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  notes: string[];
};

export type ReportResult = {
  report: ReportKey;
  title: string;
  /** Одна строка под заголовком: период или дата, офис, «сутки по Ташкенту». */
  subtitle: string;
  generatedAt: string;
  sections: ReportSection[];
  /** Пустой отчёт: ни одной строки `row` ни в одном разделе. */
  empty: boolean;
};

/** Офис в выборе фильтра. Архивный тоже: по нему бывают продажи и остатки прошлых дат. */
export type ReportOffice = {
  officeId: string;
  name: string;
  archived: boolean;
};

export type ReportOptionsResponse = {
  offices: ReportOffice[];
};
