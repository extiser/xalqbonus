// `createError` берётся из `h3` явно, а не автоимпортом: в общем пространстве имён имя занято
// обёрткой Nuxt, у которой номер ответа необязателен (`denial.ts`).
import { createError } from 'h3';

import { ApplicationDenialError } from '#server/services/candidates/applicationDenial';
import { WEB_LANGUAGE } from '#shared/denials';
import { applicationDenialText, type ApplicationDenialCode } from '#shared/candidateApplications';

/**
 * Отказы раздела «Заявки» в ответе HTTP (issue #471): код — экрану для решения, текст —
 * из словаря `shared/candidateApplications.ts`.
 *
 * Номер ответа — по смыслу: заявки нет — `404`; негодное тело — `400`; статус уже сменили или
 * бот не может писать — `409`, запрос верный, но предмет в другом состоянии; Telegram отказал —
 * `502`, отказала внешняя система.
 */

const STATUS_BY_CODE: Readonly<Record<ApplicationDenialCode, { statusCode: number; statusMessage: string }>> = {
  application_not_found: { statusCode: 404, statusMessage: 'Not Found' },
  status_invalid: { statusCode: 400, statusMessage: 'Bad Request' },
  message_invalid: { statusCode: 400, statusMessage: 'Bad Request' },
  status_transition_invalid: { statusCode: 409, statusMessage: 'Conflict' },
  cannot_write: { statusCode: 409, statusMessage: 'Conflict' },
  telegram_error: { statusCode: 502, statusMessage: 'Bad Gateway' },
};

export const denyApplication = (code: ApplicationDenialCode): Error =>
  createError({
    ...STATUS_BY_CODE[code],
    message: applicationDenialText(code, WEB_LANGUAGE),
    data: { code },
  });

/** Отказ сервиса — ответом; чужая ошибка уходит дальше как есть. */
export const rejectApplicationFailure = (error: unknown): unknown =>
  error instanceof ApplicationDenialError ? denyApplication(error.code) : error;

/** Идентификатор заявки из пути. Не UUID — заявки нет: базе такое значение не передаётся. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const readApplicationIdParam = (value: unknown): string => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw denyApplication('application_not_found');
  }

  return value;
};

/** Смещение страницы из адреса: целое, не меньше нуля; негодное — первая страница. */
export const readOffsetParam = (value: unknown): number => {
  const offset = typeof value === 'string' ? Number(value) : Number.NaN;

  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
};
