/**
 * РАЗВЕДКА issue #81. В `main` не уезжает — снимается вместе с ручкой проверки.
 *
 * Страница-заглушка, которую Telegram открывает как Mini App со стенда. Отдаётся
 * ручкой Nitro с разметкой внутри, а не страницей Nuxt, и это не лень: страница Nuxt
 * живёт своими бандлами по `/_nuxt/`, а снаружи всё приложение закрыто `auth_basic`
 * (docker/DEPLOY-MANUAL.md → «Входная дверь машины»). Webview Telegram пароля не спросит,
 * и открыть его придётся сразу на всём каталоге бандлов. Одна страница без сборки
 * укладывается ровно в два правила nginx без пароля — саму страницу и ручку проверки.
 *
 * Консоли на телефоне нет, поэтому страница печатает всё на себе: версию Bot API, сырой
 * `initData`, заключение сервера по подписи и дословно то, что вернул `requestContact`.
 */

const PAGE = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Разведка Mini App — телефон</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    body { margin: 0; padding: 12px; font: 13px/1.45 ui-monospace, Menlo, monospace; background: #111; color: #eee; }
    h1 { font-size: 15px; margin: 0 0 12px; }
    button { display: block; width: 100%; padding: 14px; margin: 0 0 8px; font: inherit; font-size: 15px;
             background: #2b6cb0; color: #fff; border: 0; border-radius: 8px; }
    button.secondary { background: #333; }
    textarea { width: 100%; height: 90px; box-sizing: border-box; font: inherit; font-size: 11px;
               background: #000; color: #8f8; border: 1px solid #333; border-radius: 6px; padding: 6px; }
    pre { white-space: pre-wrap; word-break: break-all; background: #000; border: 1px solid #333;
          border-radius: 6px; padding: 8px; margin: 8px 0 0; }
    .label { color: #888; margin: 12px 0 4px; }
  </style>
</head>
<body>
  <h1>Разведка Mini App — получение телефона (#81)</h1>

  <button id="ask-contact">Запросить телефон</button>
  <button id="recheck" class="secondary">Проверить подпись ещё раз</button>

  <div class="label">initData дословно — скопировать целиком:</div>
  <textarea id="raw" readonly></textarea>

  <div class="label">Журнал:</div>
  <pre id="log"></pre>

<script>
(function () {
  var logElement = document.getElementById('log');
  var telegram = window.Telegram && window.Telegram.WebApp;

  function stamp() {
    return new Date().toISOString().slice(11, 23);
  }

  function show(title, value) {
    var line = stamp() + '  ' + title;

    if (value !== undefined) {
      line += '\\n    ' + (typeof value === 'string' ? value : JSON.stringify(value));
    }

    logElement.textContent += line + '\\n';
  }

  /** Наблюдение уезжает и на сервер: там три стороны опыта складываются в одну ленту. */
  function send(note, initData) {
    return fetch('/api/miniapp-probe/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: note, initData: initData || '' })
    })
      .then(function (response) { return response.json(); })
      .then(function (verdict) { show('сервер ответил на «' + note + '»', verdict); })
      .catch(function (error) { show('запрос к серверу упал', String(error)); });
  }

  if (!telegram) {
    show('window.Telegram.WebApp отсутствует — страница открыта не из Telegram');
    return;
  }

  telegram.ready();
  telegram.expand();

  document.getElementById('raw').value = telegram.initData || '(пусто)';

  show('версия Bot API у клиента', telegram.version);
  show('платформа', telegram.platform);
  show('initData пуст?', telegram.initData ? 'нет, ' + telegram.initData.length + ' символов' : 'ДА — подписанной строки нет');
  show('initDataUnsafe', telegram.initDataUnsafe);
  show('есть ли requestContact', typeof telegram.requestContact);
  show('isVersionAtLeast(6.9)', telegram.isVersionAtLeast('6.9'));
  show('телефон в initDataUnsafe.user', telegram.initDataUnsafe && telegram.initDataUnsafe.user
    ? JSON.stringify(Object.keys(telegram.initDataUnsafe.user))
    : 'user отсутствует');

  // Сырое событие — отдельно от колбэка: у Telegram это два разных способа узнать исход,
  // и они могут приехать по-разному или не приехать вовсе.
  telegram.onEvent('contactRequested', function (payload) {
    show('событие contactRequested', payload === undefined ? '(без данных)' : payload);
    send('событие contactRequested: ' + JSON.stringify(payload === undefined ? null : payload), telegram.initData);
  });

  send('открытие страницы', telegram.initData);

  document.getElementById('ask-contact').addEventListener('click', function () {
    show('вызываю requestContact');

    if (typeof telegram.requestContact !== 'function') {
      show('вызова нет у этого клиента — версия ниже 6.9');
      send('requestContact отсутствует у клиента версии ' + telegram.version, telegram.initData);
      return;
    }

    try {
      telegram.requestContact(function () {
        // Аргументы дословно и все: документация обещает статус, а что приходит
        // в действительности и сколькими аргументами — как раз предмет разведки.
        var received = Array.prototype.slice.call(arguments);

        show('колбэк requestContact: типы', received.map(function (one) { return typeof one; }));
        show('колбэк requestContact: значения', received);
        send('колбэк requestContact ' + JSON.stringify(received), telegram.initData);
      });
    } catch (error) {
      show('requestContact бросил исключение', String(error));
      send('requestContact бросил ' + String(error), telegram.initData);
    }
  });

  document.getElementById('recheck').addEventListener('click', function () {
    show('повторная проверка подписи');
    send('повторная проверка подписи', telegram.initData);
  });
})();
</script>
</body>
</html>
`;

export default defineEventHandler((event) => {
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8');
  // Страница живёт минуты и меняется между попытками — кешу её отдавать нечего.
  setResponseHeader(event, 'cache-control', 'no-store');

  return PAGE;
});
