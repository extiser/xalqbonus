import { dayWord, monthForms, monthYear } from '#shared/monthNames';

/**
 * Причины, по которым список новичков (issue #407) не строится, — одна копия на экран и ответ
 * `400` выгрузки: экран пишет их строкой вместо таблицы, выгрузка — текстом отказа. Тексты — лист
 * `_reference/design/web/dashboard/03-depth-newbies-states.html`. Окно первых дней — параметром:
 * сервер берёт его из константы, экран — из ответа ручки.
 */

/**
 * Первый месяц истории: «Новичков в октябре 2025 нет: история заказов — с октября 2025». Без точки —
 * продолжение у каждого элемента экрана своё.
 */
export const noNewcomersText = (month: string): string =>
  `Новичков в ${monthYear(month, 'prepositional')} нет: история заказов — с ${monthYear(month, 'genitive')}`;

/** «Новичков в октябре 2025 нет: история заказов — с октября 2025. Список — с ноября 2025.» */
export const noNewcomersListText = (month: string, firstCohortMonth: string): string =>
  `${noNewcomersText(month)}. Список — с ${monthYear(firstCohortMonth, 'genitive')}.`;

/** «Новичков в сентябре нет.» — месяц собран, а новичков в нём нет. */
export const noNewcomersInMonthText = (month: string): string => `Новичков в ${monthForms(month).prepositional} нет.`;

/** «Список — с 14 октября: у новичков октября 14 дней ещё не прошли.» */
export const listFromDayText = (firstResultsDay: string, month: string, firstDays: number): string =>
  `Список — с ${dayWord(firstResultsDay)}: у новичков ${monthForms(month).genitive} ${firstDays} дней ещё не прошли.`;
