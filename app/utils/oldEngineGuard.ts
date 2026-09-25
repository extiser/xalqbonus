import { INIT_DATA_HEADER } from '#shared/types/miniapp';

/**
 * Проверка движка до основного кода — экран «обновите» вместо белого (issue #223).
 *
 * На телефоне со старым встроенным браузером Mini App открывался белым экраном без единого
 * слова: стили на Tailwind 4 рассчитаны на Chrome 111+ и Safari 16.4+, и ниже этого порога
 * приложение не рисуется. Сборку под старые движки мы не делаем — водителю говорим, что делать.
 *
 * Поэтому скрипт — строка, а не модуль: сборщик его не транспилирует, и он обязан выполниться
 * на движке, который не понимает остальное приложение. **Только ES5**: `var`, `function`,
 * без стрелок, `let`/`const`, шаблонных строк, `?.`, `??`, `forEach` по `NodeList`, `fetch`
 * и `Promise`. Проверка — `make old-engine-guard`.
 *
 * Ставит его `app/pages/app.vue` в `<head>` сразу после скрипта Telegram: тот блокирующий,
 * и к этому моменту `window.Telegram.WebApp` уже есть.
 *
 * Что делает:
 *
 *   1. Движок старый — нет `CSS.supports`, нет `color-mix()` (Chrome 111, Safari 16.2) или нет
 *      `CSS.registerProperty` (Safari 16.4). Вместе — порог Tailwind 4.
 *   2. Телефон — по `Telegram.WebApp.platform`, а если его нет — по строке браузера. На компьютере
 *      экрана нет даже на старом движке: водитель работает с телефона (решение Руслана 25-09-2026).
 *   3. Старый движок на телефоне — прячет корень Nuxt, рисует экран своим корнем в `<body>`
 *      и ставит `window.__xbOldEngine`: по нему основной код не начинает загрузку.
 *   4. Телефон с подписанной строкой — пишет вход в лог устройств (`POST /api/miniapp/device`)
 *      на каждом открытии. Основной код этого запроса не повторяет. На старом движке ответ
 *      несёт офисы; не ответил или офисов нет — экран без них, повторного запроса нет.
 *
 * Разметка и CSS — из макетов `_reference/design/registration/state-old-browser-*.html` как
 * есть: CSS нарочно старый (без flex gap, `inset`, `dvh`, `@layer`, `oklch`), и переписывать
 * его на Tailwind нельзя — Tailwind здесь и не работает. Шрифт — стеком из макета: адреса
 * шрифтов приложения выдаёт сборка, скрипту они не известны. Логотип — тот же файл, что
 * у `MemberLogo`: он лежит в `public/`, и адрес у него постоянный.
 *
 * Принудительный показ — только на локальном стенде (`nuxt dev`): страница ставит перед скриптом
 * `window.__xbOldEngineForceAllowed = true`, и тогда `?old-engine=android` или `?old-engine=ios`
 * показывает экран на любом движке и любой платформе. Такой вход пишется как вход со старым
 * движком — ровно как настоящий, иначе экран остался бы без офисов.
 */

declare global {
  interface Window {
    /** Движок старый, на экране «обновите» — основной код ничего не грузит. */
    __xbOldEngine?: boolean;
    /** Разрешён принудительный показ экрана — только `nuxt dev`. */
    __xbOldEngineForceAllowed?: boolean;
  }
}

/** Ставится перед стражем на локальном стенде — и только там. */
export const OLD_ENGINE_FORCE_ALLOWED_SCRIPT = 'window.__xbOldEngineForceAllowed = true;';

export const OLD_ENGINE_GUARD_SCRIPT = `(function () {
  var webApp = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var userAgent = navigator.userAgent || '';

  function isEngineOld() {
    var css = window.CSS;

    if (!css || typeof css.supports !== 'function') {
      return true;
    }

    if (!css.supports('color', 'color-mix(in srgb, red, blue)')) {
      return true;
    }

    return typeof css.registerProperty !== 'function';
  }

  function readPhonePlatform() {
    var platform = webApp && typeof webApp.platform === 'string' ? webApp.platform : '';

    if (platform === 'android' || platform === 'ios') {
      return platform;
    }

    if (platform !== '' && platform !== 'unknown') {
      return '';
    }

    if (/Android/.test(userAgent)) {
      return 'android';
    }

    return /iPhone|iPad/.test(userAgent) ? 'ios' : '';
  }

  function readForcedPlatform() {
    var match;

    if (window.__xbOldEngineForceAllowed !== true) {
      return '';
    }

    match = /[?&]old-engine=(android|ios)(&|$)/.exec(window.location.search);

    return match ? match[1] : '';
  }

  var forcedPlatform = readForcedPlatform();
  var phonePlatform = readPhonePlatform();
  var screenPlatform = forcedPlatform !== '' ? forcedPlatform : phonePlatform;
  var engineOk = forcedPlatform === '' && !isEngineOld();
  var initData = webApp && typeof webApp.initData === 'string' ? webApp.initData : '';
  var hasInitData = /(^|&)hash=/.test(initData) && /(^|&)auth_date=/.test(initData);
  var showScreen = !engineOk && screenPlatform !== '';

  var CSS_TEXT = [
    '#__nuxt { display: none !important; }',
    'html, body { background: #0B0D11; margin: 0; }',
    '.screen {',
    '  position: relative; width: 100%; max-width: 520px; min-height: 100vh; margin: 0 auto;',
    '  box-sizing: border-box; background: #0B0D11; color: #F4F6F8; overflow: hidden;',
    "  font-family: Manrope, 'Segoe UI', Roboto, sans-serif; padding-bottom: 124px;",
    '}',
    '.screen.screen-ios { padding-bottom: 40px; }',
    '.bg { position: absolute; top: 0; left: 0; right: 0; height: 470px; overflow: hidden; pointer-events: none; }',
    '.blob { position: absolute; border-radius: 50%; }',
    '@keyframes drift-core {',
    '  0%   { transform: translate(-150px, -10px) scale(1.00); opacity: 0.92; }',
    '  25%  { transform: translate(-60px,  60px) scale(1.22); opacity: 1.00; }',
    '  50%  { transform: translate(-170px, 96px) scale(0.90); opacity: 0.80; }',
    '  75%  { transform: translate(-260px, 24px) scale(1.12); opacity: 0.95; }',
    '  100% { transform: translate(-150px, -10px) scale(1.00); opacity: 0.92; }',
    '}',
    '@keyframes drift-wine {',
    '  0%   { transform: translate(-230px,  40px) scale(1.08); opacity: 0.80; }',
    '  30%  { transform: translate(-280px, -30px) scale(0.88); opacity: 1.00; }',
    '  60%  { transform: translate(-90px,  104px) scale(1.26); opacity: 0.70; }',
    '  100% { transform: translate(-230px,  40px) scale(1.08); opacity: 0.80; }',
    '}',
    '@keyframes drift-amber {',
    '  0%   { transform: translate(-90px,  86px) scale(0.96); opacity: 0.70; }',
    '  35%  { transform: translate(-250px, 20px) scale(1.22); opacity: 1.00; }',
    '  70%  { transform: translate(-40px,  116px) scale(1.06); opacity: 0.62; }',
    '  100% { transform: translate(-90px,  86px) scale(0.96); opacity: 0.70; }',
    '}',
    '.b-core  { left: 50%; top: 20px; width: 300px; height: 300px; background: radial-gradient(circle, rgba(232,54,93,0.55) 0%, rgba(232,54,93,0) 68%); filter: blur(10px); animation: drift-core 13s ease-in-out infinite; }',
    '.b-wine  { left: 50%; top: 40px; width: 360px; height: 360px; background: radial-gradient(circle, rgba(120,24,60,0.60) 0%, rgba(120,24,60,0) 70%); filter: blur(14px); animation: drift-wine 17s ease-in-out infinite; }',
    '.b-amber { left: 50%; top: 60px; width: 260px; height: 260px; background: radial-gradient(circle, rgba(247,160,60,0.32) 0%, rgba(247,160,60,0) 70%); filter: blur(12px); animation: drift-amber 23s ease-in-out infinite; }',
    '.fade { position: absolute; top: 0; right: 0; bottom: 0; left: 0; background: linear-gradient(180deg, rgba(11,13,17,0) 52%, rgba(11,13,17,0.86) 86%, #0B0D11 100%); }',
    '.top { position: relative; z-index: 2; height: 36px; padding: 50px 20px 0; }',
    '.logo { width: 68px; height: auto; display: block; float: left; margin-top: 4px; }',
    '.seg { float: right; padding: 3px; border-radius: 999px; background: rgba(20,23,29,0.72); border: 1px solid rgba(255,255,255,0.09); font-size: 0; }',
    '.seg button { height: 30px; min-width: 42px; padding: 0 10px; margin: 0; border: 0; border-radius: 999px; cursor: pointer;',
    '  background: transparent; color: #A9B2BF; font-family: inherit; font-size: 13px; font-weight: 600; letter-spacing: 0.4px; }',
    '.seg button + button { margin-left: 2px; }',
    '.seg button.on { background: #F4F6F8; color: #0B0D11; }',
    '.hero { position: relative; z-index: 1; padding: 64px 20px 0; }',
    '.hero h1 { margin: 0; font-size: 28px; font-weight: 800; line-height: 1.28; }',
    '.hero .msg { margin: 12px 0 0; max-width: 380px; font-size: 15px; font-weight: 400; line-height: 1.5; color: #C2C9D3; }',
    '.steps { margin: 18px 0 0; padding: 0; list-style: none; max-width: 400px; }',
    '.steps li { position: relative; margin: 0 0 12px; padding-left: 36px; font-size: 15px; line-height: 1.5; color: #F4F6F8; }',
    '.steps li .n { position: absolute; left: 0; top: 0; width: 24px; height: 24px; border-radius: 50%;',
    '  background: rgba(232,54,93,0.16); color: #FF6F8C; font-size: 13px; font-weight: 700; line-height: 24px; text-align: center; }',
    '.steps b { font-weight: 700; }',
    '.help { position: relative; z-index: 1; padding: 22px 20px 0; }',
    '.help .lead { margin: 0 2px 12px; font-size: 15px; font-weight: 400; line-height: 1.5; color: #C2C9D3; }',
    '.card { border-radius: 20px; border: 1px solid rgba(255,255,255,0.09); background: #14171D; }',
    '.card + .card { margin-top: 10px; }',
    '.office { padding: 14px 16px; }',
    '.office .name { font-size: 15px; font-weight: 400; color: #A9B2BF; }',
    '.office .name b { font-weight: 700; color: #F4F6F8; }',
    '.office .address { margin: 2px 0 10px; font-size: 13px; font-weight: 300; color: #8A93A2; }',
    '.office .fact { margin-top: 7px; font-size: 14px; font-weight: 400; line-height: 16px; color: #C2C9D3; }',
    '.office .fact a { color: inherit; text-decoration: none; }',
    '.office .fact svg { display: inline; vertical-align: top; margin-right: 9px; }',
    '.office .map { display: block; position: relative; margin-top: 14px; padding: 12px 0 0; border-top: 1px solid rgba(255,255,255,0.07);',
    '  font-size: 14px; font-weight: 500; color: #7FB3F5; text-decoration: none; }',
    '.office .map svg { position: absolute; right: 0; top: 12px; }',
    '.foot { position: fixed; z-index: 5; left: 0; right: 0; bottom: 0; max-width: 520px; margin: 0 auto; box-sizing: border-box;',
    '  padding: 26px 20px 32px; background: linear-gradient(180deg, rgba(11,13,17,0) 0%, #0B0D11 34%); }',
    '.send { display: block; height: 52px; border-radius: 16px; background: #E8365D; color: #fff;',
    '  font-size: 15px; font-weight: 700; line-height: 52px; text-align: center; text-decoration: none;',
    '  box-shadow: 0 8px 26px rgba(232,54,93,0.38); }',
    '@media (prefers-reduced-motion: reduce) { .b-core, .b-wine, .b-amber { animation: none; } }'
  ].join('\\n');

  // Тексты — дословно из объекта T макетов. Узбекский — черновик, вычитывает переводчик.
  var TEXTS = {
    android: {
      ru: { title: 'Обновите браузер телефона', msg: 'Браузер в телефоне устарел — приложение в нём не открывается.',
            s1: 'Нажмите кнопку внизу и обновите <b>«Android System WebView»</b>.', s2: 'В Google Play обновите и <b>«Google Chrome»</b>.',
            s3: 'Закройте Telegram и откройте приложение снова.', lead: 'Обратитесь в офис, наши сотрудники вам помогут.',
            office: 'Офис', map: 'Открыть в Яндекс Картах', button: 'Открыть Google Play' },
      uz: { title: 'Brauzerni yangilang', msg: 'Telefoningizdagi brauzer eski — ilova unda ochilmaydi.',
            s1: 'Pastdagi tugmani bosing va <b>«Android System WebView»</b>ni yangilang.', s2: "Google Play'da <b>«Google Chrome»</b>ni ham yangilang.",
            s3: 'Telegramni yoping va ilovani qayta oching.', lead: "Ofisga murojaat qiling, xodimlarimiz sizga yordam berishadi.",
            office: 'Ofis', map: 'Yandex Kartada ochish', button: "Google Play'ni ochish" }
    },
    ios: {
      ru: { title: 'Обновите iPhone', msg: 'Версия iOS устарела — приложение на ней не открывается.',
            s1: 'Откройте <b>«Настройки» → «Основные» → «Обновление ПО»</b>.', s2: 'Нажмите <b>«Загрузить и установить»</b> и дождитесь конца обновления.',
            s3: 'Закройте Telegram и откройте приложение снова.', lead: 'Обратитесь в офис, наши сотрудники вам помогут.',
            office: 'Офис', map: 'Открыть в Яндекс Картах' },
      uz: { title: 'iPhone’ni yangilang', msg: 'iOS versiyasi eski — ilova unda ochilmaydi.',
            s1: '<b>«Sozlamalar» → «Asosiy» → «Dasturiy ta’minot yangilanishi»</b>ni oching.', s2: '<b>«Yuklab olish va o‘rnatish»</b>ni bosing va yangilanish tugashini kuting.',
            s3: 'Telegramni yoping va ilovani qayta oching.', lead: "Ofisga murojaat qiling, xodimlarimiz sizga yordam berishadi.",
            office: 'Ofis', map: 'Yandex Kartada ochish' }
    }
  };

  var GOOGLE_PLAY_WEBVIEW_URL = 'https://play.google.com/store/apps/details?id=com.google.android.webview';

  var ICON_CLOCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#8A93A2" stroke-width="1.7"/><path d="M12 7.5V12l3 1.8" stroke="#8A93A2" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_PHONE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M6.2 4.5h3l1.4 3.4-2 1.4a11 11 0 0 0 5.1 5.1l1.4-2 3.4 1.4v3c0 .8-.7 1.5-1.5 1.4C10.5 17.7 6.3 13.5 4.8 6c-.1-.8.6-1.5 1.4-1.5Z" stroke="#8A93A2" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  var ICON_CHEVRON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M9.5 5.5l6.5 6.5-6.5 6.5" stroke="#7FB3F5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var language = 'ru';
  var screenRoot = null;
  var pendingOffices = null;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readLanguage() {
    var user = webApp && webApp.initDataUnsafe ? webApp.initDataUnsafe.user : null;
    var code = user && typeof user.language_code === 'string' ? user.language_code : '';

    return /^uz/.test(code) ? 'uz' : 'ru';
  }

  function applyLanguage() {
    var texts = TEXTS[screenPlatform][language];
    var index, element, list;

    document.documentElement.lang = language;
    list = screenRoot.querySelectorAll('[data-t]');
    for (index = 0; index < list.length; index++) {
      element = list[index];
      element.textContent = texts[element.getAttribute('data-t')];
    }
    list = screenRoot.querySelectorAll('[data-h]');
    for (index = 0; index < list.length; index++) {
      element = list[index];
      element.innerHTML = texts[element.getAttribute('data-h')];
    }
    list = screenRoot.querySelectorAll('.seg button');
    for (index = 0; index < list.length; index++) {
      list[index].className = list[index].getAttribute('data-lang') === language ? 'on' : '';
    }
  }

  function officeCard(office) {
    var html = '<div class="card office">';

    html += '<div class="name"><span data-t="office"></span> · <b>' + escapeHtml(office.name) + '</b></div>';
    html += '<div class="address">' + escapeHtml(office.address) + '</div>';
    if (typeof office.workHours === 'string' && office.workHours !== '') {
      html += '<div class="fact">' + ICON_CLOCK + '<span>' + escapeHtml(office.workHours) + '</span></div>';
    }
    if (typeof office.phoneE164 === 'string' && office.phoneE164 !== '') {
      html += '<div class="fact">' + ICON_PHONE + '<a href="tel:' + escapeHtml(office.phoneE164) + '">'
        + escapeHtml(office.phoneDisplay || office.phoneE164) + '</a></div>';
    }
    if (typeof office.mapUrl === 'string' && /^https?:\\/\\//i.test(office.mapUrl)) {
      html += '<a class="map" href="' + escapeHtml(office.mapUrl) + '" target="_blank" rel="noopener">'
        + '<span data-t="map"></span>' + ICON_CHEVRON + '</a>';
    }

    return html + '</div>';
  }

  function renderOffices(offices) {
    var help, html, index;

    if (screenRoot === null) {
      pendingOffices = offices;

      return;
    }

    if (offices.length === 0) {
      return;
    }

    html = '<p class="lead" data-t="lead"></p>';
    for (index = 0; index < offices.length; index++) {
      html += officeCard(offices[index]);
    }
    help = document.createElement('div');
    help.className = 'help';
    help.innerHTML = html;
    screenRoot.insertBefore(help, screenRoot.querySelector('.foot'));
    applyLanguage();
  }

  function onLanguageClick() {
    language = this.getAttribute('data-lang');
    applyLanguage();
  }

  function renderScreen() {
    var html, buttons, index;

    if (screenRoot !== null) {
      return;
    }

    html = '<div class="bg"><div class="blob b-wine"></div><div class="blob b-core"></div><div class="blob b-amber"></div><div class="fade"></div></div>'
      + '<div class="top"><img class="logo" src="/design/xalq-taxi-logo-white.png" alt="Xalq Taxi">'
      + '<div class="seg"><button type="button" data-lang="uz">UZ</button><button type="button" data-lang="ru">RU</button></div></div>'
      + '<div class="hero"><h1 data-t="title"></h1><p class="msg" data-t="msg"></p><ol class="steps">'
      + '<li><span class="n">1</span><span data-h="s1"></span></li>'
      + '<li><span class="n">2</span><span data-h="s2"></span></li>'
      + '<li><span class="n">3</span><span data-t="s3"></span></li>'
      + '</ol></div>';
    if (screenPlatform === 'android') {
      html += '<div class="foot"><a class="send" data-t="button" href="' + GOOGLE_PLAY_WEBVIEW_URL + '"></a></div>';
    }

    screenRoot = document.createElement('div');
    screenRoot.className = screenPlatform === 'ios' ? 'screen screen-ios' : 'screen';
    screenRoot.innerHTML = html;
    document.body.appendChild(screenRoot);

    buttons = screenRoot.querySelectorAll('.seg button');
    for (index = 0; index < buttons.length; index++) {
      buttons[index].onclick = onLanguageClick;
    }
    applyLanguage();

    if (pendingOffices !== null) {
      renderOffices(pendingOffices);
      pendingOffices = null;
    }

    if (webApp) {
      try {
        webApp.ready();
        webApp.expand();
      } catch (error) {
        // Клиент без этих вызовов: экран всё равно на месте.
      }
    }
  }

  function sendVisit() {
    var request = new XMLHttpRequest();

    request.open('POST', '/api/miniapp/device', true);
    request.setRequestHeader('Content-Type', 'application/json');
    request.setRequestHeader('${INIT_DATA_HEADER}', initData);
    request.onreadystatechange = function () {
      var response;

      if (request.readyState !== 4 || request.status !== 200 || !showScreen) {
        return;
      }

      try {
        response = JSON.parse(request.responseText);
      } catch (error) {
        return;
      }

      if (response && Object.prototype.toString.call(response.offices) === '[object Array]') {
        renderOffices(response.offices);
      }
    };
    request.send(JSON.stringify({
      platform: phonePlatform,
      botApiVersion: webApp && typeof webApp.version === 'string' ? webApp.version : '',
      engineOk: engineOk
    }));
  }

  if (showScreen) {
    window.__xbOldEngine = true;
    language = readLanguage();

    var style = document.createElement('style');
    style.appendChild(document.createTextNode(CSS_TEXT));
    document.head.appendChild(style);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderScreen);
    } else {
      renderScreen();
    }
  }

  if (hasInitData && phonePlatform !== '') {
    try {
      sendVisit();
    } catch (error) {
      // Лог устройств — не повод ломать открытие приложения.
    }
  }
})();
`;
