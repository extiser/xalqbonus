import { useMetrika } from '~/composables/useMetrika';
import { isUnderPath, MINIAPP_PATH } from '#shared/pagePaths';

/**
 * Просмотры веба в Метрике (issue #432): по одному на каждую смену маршрута, первый —
 * при загрузке.
 *
 * Mini App здесь не участвует: адрес у него один на все экраны, и просмотры он шлёт сам,
 * по экранам (`app/pages/app.vue`), а счётчик заводит после того, как стёр из адреса
 * подписанную строку.
 *
 * Адрес загрузки берётся из `window.location`, а не из роутера: плагин исполняется раньше
 * первой навигации, и маршрут роутера в этот момент ещё начальный, пустой.
 */
export default defineNuxtPlugin(() => {
  if (isUnderPath(window.location.pathname, MINIAPP_PATH)) {
    return;
  }

  const metrika = useMetrika();
  const router = useRouter();

  metrika.init();

  router.afterEach((to, from, failure) => {
    if (failure || isUnderPath(to.path, MINIAPP_PATH)) {
      return;
    }

    // Первая навигация приходит из начального маршрута без совпадений: источник у неё —
    // страница, с которой человек пришёл на сайт.
    const referer = from.matched.length === 0 ? document.referrer : from.fullPath;

    metrika.hit(to.fullPath, referer);
  });
});
