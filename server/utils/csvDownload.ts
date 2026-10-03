import { setResponseHeaders, type H3Event } from 'h3';

import { encodeFileName } from '#server/utils/reportDownload';

/**
 * Файл CSV для Excel (issue #325).
 *
 * Excel открывает CSV двойным щелчком без мастера импорта, и угадывать он должен сам. Поэтому:
 *
 * - UTF-8 с BOM — без метки Excel читает файл в кодировке системы, и кириллица с узбекской
 *   латиницей (`oʻ`, `gʻ`) превращаются в мусор
 * - разделитель `;` — его ждёт Excel в русской локали; запятая собрала бы строку в одну ячейку
 * - перевод строки `CRLF` — по RFC 4180
 * - ячейка в кавычках, если в ней разделитель, кавычка или перевод строки; кавычки удваиваются
 * - ячейка, начинающаяся с `=`, `+`, `-`, `@`, табуляции или возврата каретки, получает
 *   впереди апостроф: в выгрузку попадает то, что водитель написал сам, и Excel принял бы
 *   такой текст за формулу
 */

const BYTE_ORDER_MARK = '﻿';
const SEPARATOR = ';';
const LINE_BREAK = '\r\n';

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[";\r\n]/;

const csvCell = (value: string): string => {
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;

  return NEEDS_QUOTES.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
};

/** Строки таблицы → содержимое файла. */
export const buildCsv = (rows: string[][]): Buffer =>
  Buffer.from(
    BYTE_ORDER_MARK + rows.map((row) => row.map(csvCell).join(SEPARATOR)).join(LINE_BREAK) + LINE_BREAK,
    'utf8',
  );

/**
 * Отдаёт CSV скачиванием. Имя с кириллицей — через `filename*`, как у Excel-отчётов
 * (`reportDownload.ts`).
 */
export const sendCsvFile = (event: H3Event, content: Buffer, fileName: string): Buffer => {
  setResponseHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="export.csv"; filename*=UTF-8''${encodeFileName(fileName)}`,
    'Content-Length': String(content.length),
  });

  return content;
};
