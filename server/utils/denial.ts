// `createError` берётся из `h3` явно, а не автоимпортом: в общем пространстве имён имя
// занято обёрткой Nuxt, у которой номер ответа необязателен, — а отказ без номера
// ответа не отказ.
import { createError, type H3Error } from 'h3';

import {
  denialText,
  WEB_LANGUAGE,
  type DenialPayload,
  type DenialValueArgs,
  type ServerDenialCode,
} from '#shared/denials';

/**
 * Отказ, приведённый к ответу HTTP.
 *
 * Номер живёт здесь, а не в словаре: словарь читает и клиент, а ему номер ничего
 * не решает — решает код (`shared/denials.ts`). Правил доступа здесь тоже нет: кому
 * отказать, решают `employeeAuth.ts` и сервисы, здесь — как об этом сказать.
 *
 * `401` — «представьтесь заново», вход это исправит. `403` — «представились, но доступа
 * нет», вход не поможет, и интерфейс обязан сказать почему. `429` — «позже».
 */
const DENIAL_STATUS: Readonly<Record<ServerDenialCode, 401 | 403 | 429>> = {
  no_credentials: 401,
  invalid_session: 401,
  sessions_revoked: 401,
  invalid_credentials: 401,
  unknown_employee: 403,
  disabled: 403,
  role_not_allowed: 403,
  throttled: 429,
};

/** Причина ответа — та, что положена номеру. Человеку её не показывают. */
const STATUS_MESSAGE: Readonly<Record<401 | 403 | 429, string>> = {
  401: 'Unauthorized',
  403: 'Forbidden',
  429: 'Too Many Requests',
};

/**
 * Отказ ручки: код — клиенту для решения, текст — человеку.
 *
 * Текст берётся по коду из словаря, а не пишется в ручке: написанный по месту, он однажды
 * расходится с тем, что показывает соседний экран, и перевести его нечем.
 *
 * Подстановки идут вслед за кодом и проверяются им же: отказу без них передать нечего,
 * а `throttled` без минут не собирается (`shared/denials.ts`).
 */
export const denyAccess = <Code extends ServerDenialCode>(
  code: Code,
  ...values: DenialValueArgs<Code>
): H3Error => {
  const statusCode = DENIAL_STATUS[code];

  return createError({
    statusCode,
    statusMessage: STATUS_MESSAGE[statusCode],
    message: denialText(code, WEB_LANGUAGE, ...values),
    // Тело отказа собирает Nitro, и единственное место в нём под наше — `data`.
    data: { code } satisfies DenialPayload,
  });
};
