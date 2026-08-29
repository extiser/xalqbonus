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
