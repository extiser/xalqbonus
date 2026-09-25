import {
  denialText,
  isServerDenialCode,
  WEB_LANGUAGE,
  type ServerDenialCode,
} from '#shared/denials';

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
export const failureDenial = (error: unknown): ServerDenialCode | null => {
  const code = asRecord(failureBody(error)?.data)?.code;

  return isServerDenialCode(code) ? code : null;
};

/**
 * Код отказа как есть — для доменных отказов, которых нет в общем словаре: их список знает
 * тот, кто решает. `null` — ответа не было или кода в нём нет.
 */
export const failureCode = (error: unknown): string | null => {
  const code = asRecord(failureBody(error)?.data)?.code;

  return typeof code === 'string' ? code : null;
};

/**
 * Поле формы, к которому ручка отнесла отказ. `null` — отказ не про поле или ответа не было.
 *
 * Строкой без проверки по списку: какие поля у формы, знает форма, и значение, которого
 * у неё нет, просто не встанет ни к одному полю.
 */
export const failureField = (error: unknown): string | null => {
  const field = asRecord(failureBody(error)?.data)?.field;

  return typeof field === 'string' ? field : null;
};

/**
 * Текст, который прислал сервер. `null` — ответа не было или текста в нём нет.
 *
 * Отдельно от `failureText`, потому что запасной текст у дверей разный: у веба он из словаря
 * отказов на языке админки, у водителя — из водительского словаря на его языке, и приходит
 * с экраном участника.
 */
export const failureMessage = (error: unknown): string | null => {
  const message = failureBody(error)?.message;

  return typeof message === 'string' && message.trim() !== '' ? message : null;
};

/** Что показать человеку. */
export const failureText = (error: unknown): string =>
  failureMessage(error) ?? denialText('request_failed', WEB_LANGUAGE);
