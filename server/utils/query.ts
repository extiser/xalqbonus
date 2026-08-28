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
