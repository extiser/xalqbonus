import { setResponseHeaders, type H3Event } from 'h3';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Имя файла для `filename*` (RFC 5987): percent-encoding UTF-8. `encodeURIComponent` оставляет
 * `' ( ) *` как есть, а в этом поле они запрещены — офис со скобками в названии сломал бы имя.
 */
const encodeFileName = (fileName: string): string =>
  encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * Отдаёт книгу Excel скачиванием (issue #308).
 *
 * Кириллица в имени — только через `filename*`: в простом `filename` браузер показал бы её
 * «кракозябрами». Простое `filename="report.xlsx"` остаётся запасным для того, кто `filename*`
 * не понимает.
 */
export const sendReportFile = (event: H3Event, content: Buffer, fileName: string): Buffer => {
  setResponseHeaders(event, {
    'Content-Type': XLSX_CONTENT_TYPE,
    'Content-Disposition': `attachment; filename="report.xlsx"; filename*=UTF-8''${encodeFileName(fileName)}`,
    'Content-Length': String(content.length),
  });

  return content;
};
