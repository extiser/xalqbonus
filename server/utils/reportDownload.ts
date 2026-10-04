import { setResponseHeaders, type H3Event } from 'h3';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Имя файла для `filename*` (RFC 5987): percent-encoding UTF-8. `encodeURIComponent` оставляет
 * `' ( ) *` как есть, а в этом поле они запрещены — офис со скобками в названии сломал бы имя.
 */
export const encodeFileName = (fileName: string): string =>
  encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * Отдаёт файл скачиванием: книгу Excel отчёта (issue #308), QR промо-метки (issue #380).
 * Тип — по умолчанию книга Excel: отчётов большинство.
 *
 * Кириллица в имени — только через `filename*`: в простом `filename` браузер показал бы её
 * «кракозябрами». Простое `filename="report.<расширение>"` остаётся запасным для того,
 * кто `filename*` не понимает.
 */
export const sendReportFile = (
  event: H3Event,
  content: Buffer,
  fileName: string,
  contentType: string = XLSX_CONTENT_TYPE,
): Buffer => {
  const extension = /\.[A-Za-z0-9]+$/.exec(fileName)?.[0] ?? '';

  setResponseHeaders(event, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="report${extension}"; filename*=UTF-8''${encodeFileName(fileName)}`,
    'Content-Length': String(content.length),
  });

  return content;
};
