import { createError, type H3Error } from 'h3';

import { ReportParamsError } from '#server/services/reports/reportParams';

/**
 * Что ответить на негодный параметр отчёта: `400` с текстом правила (issue #308).
 *
 * Отказ про то, что прислали, а не про доступ, — строкой при своём правиле, а не кодом
 * словаря двери (docs/decisions.md → «Отказ двери веба говорит кодом, а текст живёт
 * словарём»). Экран показывает текст под панелью фильтров как есть.
 *
 * `null` — не отказ, а поломка: такое уходит пятисоткой.
 */
export const explainReportFailure = (error: unknown): H3Error | null =>
  error instanceof ReportParamsError
    ? createError({ statusCode: 400, statusMessage: 'Bad Request', message: error.message })
    : null;

/** Отказ в человеческом виде или исходная ошибка — для `catch` в ручке. */
export const rethrowReportFailure = (error: unknown): never => {
  throw explainReportFailure(error) ?? error;
};
