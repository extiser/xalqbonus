/**
 * Отказ ручки, приведённый к тому, что показывают человеку.
 *
 * Текст берётся серверный, а не собирается заново по кодам: разводить отказы — работа
 * сервера, и он уже развёл их так, как надо показать. Своя таблица кодов на клиенте
 * разошлась бы с серверной на первой же правке, и человек увидел бы «неверный пароль»
 * там, где сервер сказал «слишком много попыток, подождите».
 *
 * Запасной текст нужен на случай, когда до ручки не дошло вовсе: упавший прокси отвечает
 * своей страницей, и разбирать в ней нечего.
 */

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

/** Код ответа отказавшей ручки. `null`, если ответа не было вовсе. */
export const failureStatus = (error: unknown): number | null => {
  const failure = asRecord(error);
  const statusCode = failure?.statusCode;

  return typeof statusCode === 'number' ? statusCode : null;
};

export const failureMessage = (error: unknown, fallback: string): string => {
  const body = asRecord(asRecord(error)?.data);
  const message = body?.message;

  return typeof message === 'string' && message.trim() !== '' ? message : fallback;
};
