import { denialText, isDenialCode, WEB_LANGUAGE, type DenialCode } from '#shared/denials';

/**
 * Отказ ручки, приведённый к тому, по чему решают и что показывают человеку.
 *
 * Решают по коду: сравнение сообщений ломается от правки запятой, а код — это то, что
 * ручка сказала про случившееся (`shared/denials.ts`). Своей таблицы кодов у клиента нет
 * и здесь: код и текст к нему лежат в общем словаре, и разойтись им негде.
 *
 * Показывается текст из ответа: его собрал сервер по тому же словарю и подставил в него
 * то, чего клиент не знает, — минуты паузы, например. Словарь читается ровно для одного
 * отказа: когда ответа не было вовсе. Упавший прокси отвечает своей страницей, и разбирать
 * в ней нечего.
 */

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

/** Тело ответа отказавшей ручки. `null`, если ответа не было вовсе. */
const failureBody = (error: unknown): Record<string, unknown> | null =>
  asRecord(asRecord(error)?.data);

/** Код отказа. `null`, если ответа не было или код в нём не наш. */
export const failureDenial = (error: unknown): DenialCode | null => {
  const code = asRecord(failureBody(error)?.data)?.code;

  return isDenialCode(code) ? code : null;
};

/** Что показать человеку. */
export const failureText = (error: unknown): string => {
  const message = failureBody(error)?.message;

  return typeof message === 'string' && message.trim() !== ''
    ? message
    : denialText('request_failed', WEB_LANGUAGE);
};
