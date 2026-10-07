import { consola } from 'consola';
import { getRequestURL } from 'h3';
import { isMetrikaExcludedPath, METRIKA_ID_GLOBAL } from '#shared/metrika';

/**
 * Загрузчик счётчика Яндекс Метрики в `<head>` каждой страницы (issue #432).
 *
 * Номер счётчика читается из окружения в рантайме и вставляется в HTML ответа, а не
 * запекается сборкой: образ собирается без `.env`, и значение сборки пусто
 * (docs/decisions.md → «Окружение читается напрямую»). Пустая переменная — законное
 * состояние локального стенда: скрипта на странице нет вовсе.
 *
 * Вставляется официальный загрузчик без `init`: счётчик заводит клиент (`useMetrika`).
 * В Mini App подписанная `initData` лежит в хеше адреса, пока её не прочитали и не стёрли,
 * а загрузчик асинхронный и успел бы завести счётчик раньше — с пропуском водителя в адресе.
 * Вызов `init` из кода приходится на момент, когда хеша уже нет; веб заводит счётчик сразу.
 *
 * Страниц одноразовых ссылок и макетов счётчик не касается: в их адресе токен
 * (`shared/metrika.ts` → `isMetrikaExcludedPath`).
 */
const log = consola.withTag('metrika');

/** Номер счётчика — только цифры: он попадает в страницу внутрь `<script>` как есть. */
const COUNTER_ID_PATTERN = /^\d+$/;

const TAG_URL = 'https://mc.yandex.ru/metrika/tag.js';

/** Официальный загрузчик Метрики — очередь `ym` и асинхронный `tag.js`. */
const loaderScript = (counterId: string): string =>
  `<script>window.${METRIKA_ID_GLOBAL}=${counterId};` +
  '(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};' +
  'm[i].l=1*new Date();' +
  'for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}' +
  'k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})' +
  `(window,document,'script','${TAG_URL}','ym');</script>`;

export default defineNitroPlugin((nitroApp) => {
  const counterId = (process.env.YANDEX_METRIKA_ID ?? '').trim();

  if (counterId === '') {
    log.info('номер счётчика Метрики не задан: счётчика на страницах нет');

    return;
  }

  // Не падаем: без Метрики приложение работает, а строка в логе говорит, почему её нет.
  if (!COUNTER_ID_PATTERN.test(counterId)) {
    log.warn('номер счётчика Метрики — не число: счётчика на страницах нет', { counterId });

    return;
  }

  const script = loaderScript(counterId);

  nitroApp.hooks.hook('render:html', (html, { event }) => {
    if (isMetrikaExcludedPath(getRequestURL(event).pathname)) {
      return;
    }

    html.head.push(script);
  });

  log.info('счётчик Метрики на страницах', { counterId });
});
