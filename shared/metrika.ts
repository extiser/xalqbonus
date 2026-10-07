import { DESIGN_PATH, isUnderPath, LINK_PAGE_PREFIXES } from './pagePaths';

/**
 * Яндекс Метрика (issue #432): что общее у сервера, ставящего загрузчик счётчика в страницу,
 * и у клиента, который счётчик заводит и шлёт просмотры.
 *
 * Относительными путями, а не через `#shared`: так подключаются соседние файлы `shared/`.
 */

/**
 * Глобальная переменная с номером счётчика. Её пишет сервер в `<head>` рядом с загрузчиком
 * (`server/plugins/metrika.ts`), читает `useMetrika`. Номер едет в страницу ответом, а не
 * сборкой: значение окружения на сборке образа пусто (docs/decisions.md → «Окружение
 * читается напрямую»).
 */
export const METRIKA_ID_GLOBAL = '__xbMetrikaId';

/**
 * Страницы, где счётчика нет вовсе: в адресах одноразовых ссылок лежит токен, и в Метрику
 * он уехать не должен — ни адресом просмотра, ни источником следующего. Макеты — служебная
 * страница разработки, смотреть в ней нечего.
 */
export const isMetrikaExcludedPath = (path: string): boolean =>
  isUnderPath(path, DESIGN_PATH) || LINK_PAGE_PREFIXES.some((prefix) => path.startsWith(prefix));
