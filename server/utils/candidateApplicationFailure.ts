// `createError` берётся из `h3` явно, а не автоимпортом: в общем пространстве имён имя занято
// обёрткой Nuxt, у которой номер ответа необязателен (`denial.ts`).
import { createError } from 'h3';

import { CandidateApplicationError } from '#server/services/candidates/submitCandidateApplication';
import type { CandidateApplicationDenialCode, CandidateApplicationDenialPayload } from '#shared/candidateApplications';

/**
 * Отказ заявки кандидата в ответе HTTP (issue #456): код — экрану для решения, номер — протоколу.
 *
 * Подпись контакта не принята — `401`, как у регистрации: строка не от Telegram или просрочена.
 * Сотрудник — `403`, участник — `409`: запрос верный, но этот Telegram уже свой. Остальное — `400`.
 */
const STATUS: Readonly<Record<CandidateApplicationDenialCode, { statusCode: number; statusMessage: string }>> = {
  not_ad_launch: { statusCode: 400, statusMessage: 'Bad Request' },
  name_invalid: { statusCode: 400, statusMessage: 'Bad Request' },
  contact_missing: { statusCode: 400, statusMessage: 'Bad Request' },
  contact_not_own: { statusCode: 400, statusMessage: 'Bad Request' },
  phone_invalid: { statusCode: 400, statusMessage: 'Bad Request' },
  language_invalid: { statusCode: 400, statusMessage: 'Bad Request' },
  contact_rejected: { statusCode: 401, statusMessage: 'Unauthorized' },
  employee: { statusCode: 403, statusMessage: 'Forbidden' },
  member: { statusCode: 409, statusMessage: 'Conflict' },
};

export const candidateApplicationDenial = (code: CandidateApplicationDenialCode): Error => {
  const data: CandidateApplicationDenialPayload = { code };

  return createError({ ...STATUS[code], message: `заявка отклонена: ${code}`, data });
};

/** Отказ сервиса — ответом; чужая ошибка уходит дальше как есть. */
export const rejectCandidateApplicationFailure = (error: unknown): unknown =>
  error instanceof CandidateApplicationError ? candidateApplicationDenial(error.code) : error;
