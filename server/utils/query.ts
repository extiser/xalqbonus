// `createError` и `getRouterParam` берутся из `h3` явно, а не автоимпортом: файл читает
// и воркер, у которого автоимпортов Nitro нет вовсе.
import { createError, getRouterParam, type H3Event } from 'h3';

/**
 * Разбор чисел из строки запроса.
 *
 * Пусто, мусор и отрицательное — это «параметр не задан», а не отказ: страница журнала,
 * открытая с испорченной ссылкой, обязана показать первую страницу, а не ошибку. Потолок
 * значения ставит сервис — он один знает, сколько строк ему не жалко отдать.
 */
export const readPositiveInteger = (value: unknown, fallback: number): number => {
  if (typeof value !== 'string' || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
};

/**
 * Идентификатор человека из пути запроса.
 *
 * Проверяется здесь, а не в базе: строка, не похожая на uuid, уходит в `::uuid` и роняет
 * запрос ошибкой Postgres — это пятисотка там, где на самом деле испорченная ссылка.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const readUuid = (value: unknown): string | null =>
  typeof value === 'string' && UUID.test(value) ? value : null;

/**
 * Идентификатор из пути запроса или отказ `400`.
 *
 * Отдельной функцией, потому что ручек с идентификатором в пути стало одиннадцать, и одна
 * и та же четвёрка строк — прочитать параметр, проверить на uuid, собрать `createError` —
 * в каждой из них расходилась бы формулировкой.
 *
 * Отказом доступа это не является и кода отказа не несёт: запрос пришёл с испорченной
 * ссылкой, и проверяется здесь то, что в нём прислали, а не то, кого пускать
 * (`shared/denials.ts` → граница словаря).
 */
export const requireUuidParam = (event: H3Event, name: string): string => {
  const value = readUuid(getRouterParam(event, name));

  if (!value) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: `параметр ${name} не похож на uuid`,
    });
  }

  return value;
};
