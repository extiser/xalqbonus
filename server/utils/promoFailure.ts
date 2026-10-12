// `createError` берётся из `h3` явно, а не автоимпортом: в общем пространстве имён имя занято
// обёрткой Nuxt, у которой номер ответа необязателен (`denial.ts`).
import { createError, type H3Error } from 'h3';

import { BotUnavailableError } from '#server/services/employees/botUnavailableError';
import { LandingFailure } from '#server/services/promo/landingFailure';
import { PromoInputError } from '#server/services/promo/promoFields';
import { WEB_LANGUAGE } from '#shared/denials';
import {
  LANDING_DENIAL_FIELDS,
  landingDenialText,
  PROMO_DENIAL_FIELDS,
  promoDenialText,
  type LandingDenialCode,
  type PromoDenialCode,
  type PromoField,
} from '#shared/promo';

/**
 * Отказы раздела «Промо» в ответе HTTP (issue #380): код — форме для решения, поле — куда
 * встанет текст, текст — из словаря `shared/promo.ts`. Занятый код — `409`, как у занятого
 * телефона в приглашении: запрос верный, но предмет уже чей-то.
 *
 * Отказы лендингов (issue #478) — тем же устройством. `409` — у состояния предмета, а не у запроса:
 * лендинг стоит у меток, по метке уже переходили.
 */

/** Номер ответа отказа метки: занятый код и лендинг после перехода — состояние, а не ошибка запроса. */
const PROMO_CONFLICTS: ReadonlySet<PromoDenialCode> = new Set(['code_taken', 'landing_locked']);

const LANDING_STATUSES: Readonly<Record<LandingDenialCode, { statusCode: number; statusMessage: string }>> = {
  landing_not_found: { statusCode: 404, statusMessage: 'Not Found' },
  landing_name_invalid: { statusCode: 400, statusMessage: 'Bad Request' },
  landing_archive_too_large: { statusCode: 413, statusMessage: 'Payload Too Large' },
  landing_archive_invalid: { statusCode: 400, statusMessage: 'Bad Request' },
  landing_in_use: { statusCode: 409, statusMessage: 'Conflict' },
  landing_locked: { statusCode: 409, statusMessage: 'Conflict' },
  landing_unavailable: { statusCode: 400, statusMessage: 'Bad Request' },
};

/** Метки с таким кодом нет. */
export const promoNotFound = (): H3Error =>
  createError({ statusCode: 404, statusMessage: 'Not Found', message: 'метки с таким кодом нет' });

/**
 * Отказ сервиса — ответом; чужая ошибка уходит дальше как есть.
 *
 * Негодных полей бывает несколько сразу: код, поле и текст — первого из них, как у любого
 * отказа по полю, а `fields` — текст каждому негодному полю, чтобы форма поставила их все.
 */
export const rejectPromoFailure = (error: unknown): unknown => {
  if (error instanceof PromoInputError) {
    const [code] = error.problems;
    const fields: Partial<Record<PromoField, string>> = {};

    for (const problem of error.problems) {
      fields[PROMO_DENIAL_FIELDS[problem]] ??= promoDenialText(problem, WEB_LANGUAGE);
    }

    const conflict = PROMO_CONFLICTS.has(code);

    return createError({
      statusCode: conflict ? 409 : 400,
      statusMessage: conflict ? 'Conflict' : 'Bad Request',
      message: promoDenialText(code, WEB_LANGUAGE),
      data: { code, field: PROMO_DENIAL_FIELDS[code], fields },
    });
  }

  if (error instanceof LandingFailure) {
    return createError({
      ...LANDING_STATUSES[error.code],
      message: landingDenialText(error.code, WEB_LANGUAGE),
      data: { code: error.code, field: LANDING_DENIAL_FIELDS[error.code] },
    });
  }

  // Бота нет — ссылке и QR вести некуда. Это состояние машины, а не ошибка сотрудника,
  // поэтому 503: раздел заработает, как только появится токен.
  if (error instanceof BotUnavailableError) {
    return createError({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: 'Бот не настроен: ссылку на него собрать не из чего.',
    });
  }

  return error;
};

/** Код метки из пути: строкой как есть, негодный просто не найдётся. */
export const readPromoCodeParam = (value: unknown): string =>
  typeof value === 'string' && value.length <= 64 ? value : '';
