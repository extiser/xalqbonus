import { defineEventHandler, getRequestURL, sendRedirect } from 'h3';

/**
 * Старый адрес поиска водителя `/drivers?q=…` — сразу на `/drivers`, без query (issue #432).
 *
 * Запрос поиска давно живёт в `history.state` (`app/pages/drivers/index.vue`), но прежние адреса
 * остались в истории браузеров и в переписке, а в них телефон или номер ВУ. Такой адрес, дошедший
 * до страницы, Яндекс Метрика уносит сама — полным `page-url` своего служебного запроса при
 * заведении счётчика; без сессии проверка входа перекладывает его в `/login?next=…`, и номер
 * уезжает уже оттуда.
 *
 * Здесь, а не в route middleware Nuxt: серверный middleware отрабатывает раньше отрисовки
 * и раньше проверки входа, и до них адрес с номером не доходит вовсе. Поиск после перехода
 * пустой — так и задумано: номер в адресе больше не принимается.
 */
const DRIVERS_PATH = '/drivers';

export default defineEventHandler((event) => {
  if (event.method !== 'GET') {
    return;
  }

  const url = getRequestURL(event);

  if (url.pathname === DRIVERS_PATH && url.search !== '') {
    return sendRedirect(event, DRIVERS_PATH, 302);
  }
});
