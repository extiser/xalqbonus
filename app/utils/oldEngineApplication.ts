import { INIT_DATA_HEADER } from '#shared/types/miniapp';

/**
 * Экраны заявки кандидата на старом движке (issue #460) — то же, что экраны #456, для телефона,
 * где основной код не запускается: экран заявки и три исхода — «Заявка принята», «Заявка уже
 * отправлена» и сбой отправки.
 *
 * Сам скрипт ничего не рисует: он только объявляет `window.__xbOldEngineApplication`. Зовёт её
 * скрипт проверки движка (`oldEngineGuard.ts`), когда ответ `POST /api/miniapp/device` несёт
 * экран заявки, — и тогда «обновите» не рисуется. Поэтому `app/pages/app.vue` ставит этот скрипт
 * в `<head>` перед проверкой движка.
 *
 * Правила — те же, что у проверки движка: строка, а не модуль, **только ES5**, проверка —
 * `make old-engine-guard`. Текстов в скрипте нет: все — из ответа, на обоих языках. Дат и номеров
 * скрипт не форматирует: офисы и день заявки приходят в показном виде.
 *
 * Разметка и CSS — из макетов `_reference/design/application/old-*.html` как есть, логотип —
 * тот же файл, что у «обновите». CSS у экрана заявки и у исходов разный (низ, кнопка, строка
 * под ней), поэтому он меняется вместе с экраном, а не складывается в одну таблицу.
 *
 * Путь — как у #456 (`useCandidateApplication.ts`): имя → «Отправить заявку» → окно номера →
 * окно «Разрешить боту писать», если писать ещё нельзя → `POST /api/miniapp/applications`.
 * Окна номера нет (Bot API ниже 6.9) — номер вводится руками, окон нет вовсе. Окно, закрытое
 * свайпом, колбэк не зовёт (docs/miniapp.md), поэтому кнопка гаснет только на время запроса.
 *
 * Отказы: подпись контакта не принята — снова экран заявки с именем; сотрудник и участник —
 * перезагрузка, и проверка движка покажет то, что им положено; остальное, сеть и таймаут — сбой
 * с повтором тем же телом, без окон Telegram.
 */

declare global {
  interface Window {
    /** Рисует экран заявки на старом движке. Зовёт скрипт проверки движка. */
    __xbOldEngineApplication?: (screen: unknown, context: unknown) => void;
  }
}

export const OLD_ENGINE_APPLICATION_SCRIPT = `(function () {
  /** Версия Bot API, с которой есть окна номера и «Разрешить боту писать». */
  var CONTACT_WINDOWS_VERSION = '6.9';
  var MANUAL_PHONE_DIGITS = 9;
  var SEND_TIMEOUT_MS = 15000;

  // Общее у всех экранов — из макетов old-*: фон, шапка, заголовок. Значкам \`display: inline\`
  // сверх макетов, как у «обновите»: сброс стилей приложения ставит \`svg\` блоком, и на движках
  // с \`@layer\` значок встал бы строкой над текстом.
  var COMMON_CSS = [
    'html, body { background: #0B0D11; margin: 0; }',
    "body { color: #F4F6F8; font-family: Manrope, 'Segoe UI', Roboto, sans-serif; }",
    '.screen {',
    '  position: relative; width: 100%; max-width: 520px; min-height: 100vh; margin: 0 auto;',
    '  box-sizing: border-box; background: #0B0D11; color: #F4F6F8; overflow: hidden;',
    "  font-family: Manrope, 'Segoe UI', Roboto, sans-serif;",
    '}',
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
    '.seg.locked { opacity: 0.45; }',
    '.hero { position: relative; z-index: 1; padding: 64px 20px 0; }',
    '.hero h1 { margin: 0; font-size: 28px; font-weight: 800; line-height: 1.28; }',
    '.hero .lead { margin: 12px 0 0; max-width: 380px; font-size: 15px; font-weight: 400; line-height: 1.5; color: #C2C9D3; }'
  ];

  // Экран заявки — old-01-form.html. Фокус поля — классом, а не :focus-within.
  var FORM_CSS = [
    '.foot { position: fixed; z-index: 5; left: 0; right: 0; bottom: 0; max-width: 520px; margin: 0 auto; box-sizing: border-box;',
    '  padding: 16px 20px 20px; background: linear-gradient(180deg, rgba(11,13,17,0) 0%, #0B0D11 26%); }',
    '.field { display: block; margin: 0 0 10px; padding: 12px 16px; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; background: #21242A; }',
    '.field.focus { border-color: #E8365D; background: rgba(232,54,93,.10); }',
    '.field label { display: block; margin: 0 0 6px; font-size: 12px; font-weight: 600; letter-spacing: .3px; color: #8A93A2; }',
    '.field input { display: block; box-sizing: border-box; border: 0; outline: 0; background: transparent; color: #F4F6F8; font-family: inherit; font-size: 16px; font-weight: 500; padding: 0; height: 24px; width: 100%; }',
    '.field input::placeholder { color: #626A77; font-weight: 400; }',
    '.manual { position: relative; padding-left: 46px; }',
    '.manual .cc { position: absolute; left: 0; top: 0; font-size: 16px; font-weight: 500; line-height: 24px; color: #8A93A2; }',
    '.fields { margin: 0 0 12px; }',
    '.fields .field:last-child { margin-bottom: 0; }',
    '.ask { margin: 0 0 12px; text-align: center; font-size: 13px; font-weight: 300; line-height: 1.5; color: #8A93A2; min-height: 39px; }',
    '.ask.warn { color: #FFB4C2; }',
    '.send { display: block; width: 100%; height: 52px; border: 0; border-radius: 16px; cursor: pointer;',
    '  background: #E8365D; color: #fff; font-family: inherit; font-size: 15px; font-weight: 700; line-height: 52px; text-align: center;',
    '  box-shadow: 0 8px 26px rgba(232,54,93,0.38); }',
    '.send.off { opacity: 0.55; box-shadow: none; cursor: default; }',
    '.spin { display: none; width: 16px; height: 16px; margin: 0 10px 0 0; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; vertical-align: -3px; animation: spin .8s linear infinite; }',
    '.send.busy .spin { display: inline-block; }',
    '@keyframes spin { to { transform: rotate(360deg); } }',
    '.checking { margin: 10px 0 0; text-align: center; font-size: 13px; font-weight: 300; color: #8A93A2; }',
    '.checking.empty { display: none; }',
    '.terms { margin: 14px 0 0; padding: 0; list-style: none; text-align: center; font-size: 12.5px; font-weight: 400; line-height: 1.45; color: #8A93A2; }',
    '.terms li { display: inline-block; margin: 2px 7px; }',
    '.terms svg { display: inline; vertical-align: -2px; margin-right: 6px; color: #E8365D; }',
    '.terms b { font-weight: 600; color: #C2C9D3; }',
    '.legend { margin: 6px 0 0; text-align: center; font-size: 11.5px; font-weight: 300; line-height: 1.4; color: #626A77; }',
    '.hide { display: none; }',
    '@media (prefers-reduced-motion: reduce) { .b-core, .b-wine, .b-amber, .spin { animation: none; } }'
  ];

  // Исходы — old-02-accepted.html, old-04-repeat.html и old-03-failed.html: у сбоя к ним добавлены
  // загрузчик, серая кнопка и строка под основной. Офисы — карточкой «обновите», по одной под другой.
  var OUTCOME_CSS = [
    '.lead b { font-weight: 600; color: #F4F6F8; white-space: nowrap; }',
    '.cap { margin: 28px 0 8px; padding: 0 2px; font-size: 12px; font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase; color: #8A93A2; }',
    '.card { border-radius: 20px; border: 1px solid rgba(255,255,255,0.09); background: #14171D; }',
    '.card + .card { margin-top: 10px; }',
    '.office { padding: 14px 16px; }',
    '.office .name { font-size: 15px; font-weight: 400; color: #A9B2BF; }',
    '.office .name b { font-weight: 700; color: #F4F6F8; }',
    '.office .address { margin: 2px 0 10px; font-size: 13px; font-weight: 300; color: #8A93A2; }',
    '.office .fact { margin-top: 7px; font-size: 14px; font-weight: 400; line-height: 16px; color: #C2C9D3; }',
    '.office .fact svg { display: inline; vertical-align: top; margin-right: 9px; }',
    '.office .map { display: block; position: relative; margin-top: 14px; padding: 12px 0 0; border-top: 1px solid rgba(255,255,255,0.07);',
    '  font-size: 14px; font-weight: 500; color: #7FB3F5; text-decoration: none; }',
    '.office .map svg { position: absolute; right: 0; top: 12px; }',
    '.foot { position: fixed; z-index: 5; left: 0; right: 0; bottom: 0; max-width: 520px; margin: 0 auto; box-sizing: border-box;',
    '  padding: 22px 20px 20px; background: linear-gradient(180deg, rgba(11,13,17,0) 0%, #0B0D11 26%); }',
    '.send { display: block; height: 52px; border-radius: 16px; background: #E8365D; color: #fff;',
    '  font-size: 15px; font-weight: 700; line-height: 52px; text-align: center; text-decoration: none;',
    '  box-shadow: 0 8px 26px rgba(232,54,93,0.38); }',
    '.send svg { display: inline; vertical-align: -4px; margin-right: 10px; }',
    '.send.off { opacity: 0.55; box-shadow: none; cursor: default; }',
    '.spin { display: none; width: 16px; height: 16px; margin: 0 10px 0 0; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; vertical-align: -3px; animation: spin .8s linear infinite; }',
    '.send.busy .spin { display: inline-block; }',
    '@keyframes spin { to { transform: rotate(360deg); } }',
    '.grey { display: block; height: 50px; margin-top: 12px; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; background: #21242A; color: #F4F6F8;',
    '  font-size: 15px; font-weight: 600; line-height: 50px; text-align: center; text-decoration: none; }',
    '.grey svg { display: inline; vertical-align: -4px; margin-right: 10px; }',
    '.checking { margin: 12px 0 0; text-align: center; font-size: 13px; font-weight: 300; line-height: 18px; color: #8A93A2; min-height: 18px; }',
    '.checking.err { font-weight: 400; color: #FF5C78; }',
    '.checking svg { vertical-align: -3px; margin-right: 7px; display: none; }',
    '.checking.err svg { display: inline; }',
    '@media (prefers-reduced-motion: reduce) { .b-core, .b-wine, .b-amber { animation: none; } }'
  ];

  var BACKGROUND_HTML = '<div class="bg"><div class="blob b-wine"></div><div class="blob b-core"></div><div class="blob b-amber"></div><div class="fade"></div></div>';
  var TOP_HTML = '<div class="top"><img class="logo" src="/design/xalq-taxi-logo-white.png" alt="Xalq Taxi">'
    + '<div class="seg"><button type="button" data-lang="uz">UZ</button><button type="button" data-lang="ru">RU</button></div></div>';

  var ICON_COMMISSION = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M6 18L18 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" stroke-width="2"/><circle cx="16.5" cy="16.5" r="2.5" stroke="currentColor" stroke-width="2"/></svg>';
  var ICON_GIFT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><rect x="4" y="9" width="16" height="11" rx="2" stroke="currentColor" stroke-width="2"/><path d="M4 13h16M12 9v11M12 9c-2-4-6-3-5-1s5 1 5 1zm0 0c2-4 6-3 5-1s-5 1-5 1z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  var ICON_CLOCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#8A93A2" stroke-width="1.7"/><path d="M12 7.5V12l3 1.8" stroke="#8A93A2" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_PHONE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M6.2 4.5h3l1.4 3.4-2 1.4a11 11 0 0 0 5.1 5.1l1.4-2 3.4 1.4v3c0 .8-.7 1.5-1.5 1.4C10.5 17.7 6.3 13.5 4.8 6c-.1-.8.6-1.5 1.4-1.5Z" stroke="#8A93A2" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  var ICON_CHEVRON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M9.5 5.5l6.5 6.5-6.5 6.5" stroke="#7FB3F5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_WRITE_WHITE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M4.5 11.6 19 5.5l-2.6 13.2-4.6-3.9-2.6 2.4.4-4.2 6.2-5.6-7.7 4.6-3.6-1.3Z" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  var ICON_WRITE_GREY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M4.5 11.6 19 5.5l-2.6 13.2-4.6-3.9-2.6 2.4.4-4.2 6.2-5.6-7.7 4.6-3.6-1.3Z" stroke="#F4F6F8" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  var ICON_ERROR = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"><circle cx="12" cy="12" r="9" stroke="#FF5C78" stroke-width="1.8"/><path d="M12 7.5v5.5" stroke="#FF5C78" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.3" r="1.2" fill="#FF5C78"/></svg>';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Подстановка без особых знаков \`replace\`: имя с «$&» вставляется как есть. */
  function fill(template, name, value) {
    return template.split('{' + name + '}').join(value);
  }

  function setClass(element, name, on) {
    var list = (' ' + element.className + ' ').replace(' ' + name + ' ', ' ');

    element.className = (on ? list + name : list).replace(/^ +| +$/g, '').replace(/ +/g, ' ');
  }

  function countDigits(value) {
    return value.replace(/[^0-9]/g, '').length;
  }

  function isArray(value) {
    return Object.prototype.toString.call(value) === '[object Array]';
  }

  window.__xbOldEngineApplication = function (screen, context) {
    var webApp = context.webApp;
    var texts = screen.texts;
    var language = screen.language === 'uz' ? 'uz' : 'ru';
    var offices = isArray(screen.offices) ? screen.offices : [];

    /** 'form' | 'accepted' | 'repeat' | 'failed' */
    var view = screen.kind === 'sent' ? 'repeat' : 'form';
    var application = screen.kind === 'sent'
      ? { name: screen.name, phone: screen.phone, writeAllowed: screen.writeAllowed === true, submittedAtText: screen.submittedAtText }
      : null;

    var nameValue = '';
    var phoneValue = '';
    /** В окне номера нажали «Отмена». */
    var declined = false;
    /** Запрос к серверу в пути. */
    var busy = false;
    /** Тело последней отправки — повтор после сбоя уходит им же, без окон Telegram. */
    var lastBody = null;

    var root = document.createElement('div');
    var style = null;
    var styleView = '';

    /**
     * Окно номера есть: \`requestContact\` и \`requestWriteAccess\` появились в Bot API 6.9. Нечем
     * сравнить версию — тоже нет: сравнение появилось ещё раньше.
     */
    function hasContactWindow() {
      if (!webApp || typeof webApp.isVersionAtLeast !== 'function' || typeof webApp.requestContact !== 'function') {
        return false;
      }

      try {
        return webApp.isVersionAtLeast(CONTACT_WINDOWS_VERSION) === true;
      } catch (error) {
        return false;
      }
    }

    var manual = !hasContactWindow();

    function byId(id) {
      return document.getElementById(id);
    }

    /** CSS экрана заявки и исходов разный — таблица меняется вместе с экраном. */
    function useStyle(kind) {
      if (styleView === kind) {
        return;
      }

      if (style !== null) {
        style.parentNode.removeChild(style);
      }

      style = document.createElement('style');
      style.appendChild(document.createTextNode(COMMON_CSS.concat(kind === 'form' ? FORM_CSS : OUTCOME_CSS).join('\\n')));
      document.head.appendChild(style);
      styleView = kind;
    }

    /** Отступ экрана снизу — по высоте низа: он прибит к краю, и его высота меняется. */
    function fit() {
      var screenElement = byId('xb-application-screen');
      var foot = byId('xb-application-foot');

      if (screenElement && foot) {
        screenElement.style.paddingBottom = foot.offsetHeight + 'px';
      }
    }

    function officeCard(office) {
      var html = '<div class="card office">';

      html += '<div class="name"><span data-t="officeLabel"></span> · <b>' + escapeHtml(office.name) + '</b></div>';
      html += '<div class="address">' + escapeHtml(office.address) + '</div>';
      if (typeof office.workHours === 'string' && office.workHours !== '') {
        html += '<div class="fact">' + ICON_CLOCK + '<span>' + escapeHtml(office.workHours) + '</span></div>';
      }
      if (typeof office.phoneE164 === 'string' && office.phoneE164 !== '') {
        html += '<div class="fact">' + ICON_PHONE + '<span>' + escapeHtml(office.phoneDisplay || office.phoneE164) + '</span></div>';
      }
      if (typeof office.mapUrl === 'string' && /^https?:\\/\\//i.test(office.mapUrl)) {
        html += '<a class="map" href="' + escapeHtml(office.mapUrl) + '" target="_blank" rel="noopener">'
          + '<span data-t="mapLabel"></span>' + ICON_CHEVRON + '</a>';
      }

      return html + '</div>';
    }

    function formHtml() {
      return '<div class="screen" id="xb-application-screen">' + BACKGROUND_HTML + TOP_HTML
        + '<div class="hero"><h1 data-t="title"></h1><p class="lead" data-t="lead"></p></div></div>'
        + '<div class="foot" id="xb-application-foot"><div class="fields">'
        + '<div class="field" id="xb-name-field"><label for="xb-name" data-t="nameLabel"></label>'
        + '<input id="xb-name" type="text" autocomplete="given-name" maxlength="60" data-ph="namePlaceholder"></div>'
        + '<div class="field hide" id="xb-phone-field"><label for="xb-phone" data-t="phoneLabel"></label>'
        + '<div class="manual"><span class="cc">+998</span><input id="xb-phone" type="tel" maxlength="12" placeholder="90 123-45-67"></div></div>'
        + '</div>'
        + '<p class="ask" id="xb-ask"></p>'
        + '<button class="send off" id="xb-send" type="button"><span class="spin"></span><span data-t="send"></span></button>'
        + '<p class="checking empty" id="xb-checking"></p>'
        + '<ul class="terms">'
        + '<li>' + ICON_COMMISSION + '<b data-t="termsCommission"></b> <span data-t="termsCommissionNote"></span></li>'
        + '<li>' + ICON_GIFT + '<b data-t="termsBonus"></b> <span data-t="termsBonusNote"></span></li>'
        + '</ul>'
        + '<p class="legend" data-t="termsLegend"></p>'
        + '</div>';
    }

    function outcomeHtml() {
      var html = '<div class="screen" id="xb-application-screen">' + BACKGROUND_HTML + TOP_HTML
        + '<div class="hero"><h1 id="xb-title"></h1><p class="lead" id="xb-lead"></p>';
      var index;

      if (offices.length > 0) {
        html += '<div class="cap" data-t="officeTitle"></div>';
        for (index = 0; index < offices.length; index++) {
          html += officeCard(offices[index]);
        }
      }
      html += '</div></div><div class="foot" id="xb-application-foot">';

      if (view === 'failed') {
        html += '<a class="send" id="xb-send" href="#"><span class="spin"></span><span data-t="failedSend"></span></a>'
          + '<p class="checking err" id="xb-checking">' + ICON_ERROR + '<span id="xb-status"></span></p>'
          + '<a class="grey" id="xb-write" href="' + escapeHtml(screen.managerChatUrl) + '">' + ICON_WRITE_GREY
          + '<span data-t="writeManager"></span></a>';
      } else {
        html += '<a class="send" id="xb-write" href="' + escapeHtml(screen.managerChatUrl) + '">' + ICON_WRITE_WHITE
          + '<span data-t="writeManager"></span></a>';
      }

      return html + '</div>';
    }

    /** Строка под заголовком исхода: номер — белым и неразрывно, по нему свяжутся. */
    function leadHtml(template) {
      var parts = template.split('{phone}');

      if (parts.length < 2) {
        return escapeHtml(template);
      }

      return escapeHtml(parts[0]) + '<b>' + escapeHtml(application.phone) + '</b>' + escapeHtml(parts.slice(1).join(application.phone));
    }

    function applyOutcome(current) {
      var title = byId('xb-title');
      var lead = byId('xb-lead');
      var template;

      if (view === 'failed') {
        title.textContent = current.failedTitle;
        lead.textContent = current.failedLead;
        setClass(byId('xb-send'), 'off', busy);
        setClass(byId('xb-send'), 'busy', busy);
        setClass(byId('xb-checking'), 'err', !busy);
        byId('xb-status').textContent = busy ? current.sending : current.failedError;

        return;
      }

      if (view === 'accepted') {
        title.textContent = fill(current.acceptedTitle, 'name', application.name);
        lead.innerHTML = leadHtml(application.writeAllowed ? current.leadWrite : current.leadCall);

        return;
      }

      template = application.writeAllowed ? current.repeatLeadWrite : current.repeatLeadCall;
      title.textContent = fill(current.repeatTitle, 'name', application.name);
      lead.innerHTML = leadHtml(fill(template, 'date', application.submittedAtText[language] || ''));
    }

    function isReady() {
      var nameOk = nameValue.trim() !== '';
      var phoneOk = !manual || countDigits(phoneValue) === MANUAL_PHONE_DIGITS;

      return nameOk && phoneOk && !busy;
    }

    function applyForm(current) {
      var ask = byId('xb-ask');
      var checking = byId('xb-checking');
      var send = byId('xb-send');

      // Одна строка над кнопкой: подсказка про окна Telegram или, после «Отмены», объяснение.
      // Окна номера нет — подсказки нет вовсе.
      ask.textContent = declined ? current.declined : current.ask;
      setClass(ask, 'warn', declined);
      setClass(ask, 'hide', manual);
      setClass(byId('xb-phone-field'), 'hide', !manual);
      checking.textContent = busy ? current.sending : '';
      setClass(checking, 'empty', !busy);
      setClass(send, 'off', !isReady());
      setClass(send, 'busy', busy);
    }

    function apply() {
      var current = texts[language];
      var index, element, list;

      document.documentElement.lang = language;
      list = root.querySelectorAll('[data-t]');
      for (index = 0; index < list.length; index++) {
        element = list[index];
        element.textContent = current[element.getAttribute('data-t')];
      }
      list = root.querySelectorAll('[data-ph]');
      for (index = 0; index < list.length; index++) {
        element = list[index];
        element.placeholder = current[element.getAttribute('data-ph')];
      }
      list = root.querySelectorAll('.seg button');
      for (index = 0; index < list.length; index++) {
        list[index].className = list[index].getAttribute('data-lang') === language ? 'on' : '';
      }
      setClass(root.querySelector('.seg'), 'locked', busy);

      if (view === 'form') {
        applyForm(current);
      } else {
        applyOutcome(current);
      }

      fit();
    }

    function onLanguageClick() {
      if (!busy) {
        language = this.getAttribute('data-lang') === 'uz' ? 'uz' : 'ru';
        apply();
      }
    }

    /** Чат с ботом — через Telegram, если он даёт; иначе ссылка откроется сама. */
    function onWriteClick() {
      if (webApp && typeof webApp.openTelegramLink === 'function') {
        try {
          webApp.openTelegramLink(screen.managerChatUrl);

          return false;
        } catch (error) {
          // Клиент отказал — остаётся ссылка.
        }
      }

      return true;
    }

    function focusField(id, on) {
      return function () {
        setClass(byId(id), 'focus', on);
      };
    }

    function readResponse(request) {
      try {
        return JSON.parse(request.responseText);
      } catch (error) {
        return null;
      }
    }

    function onSent(request) {
      var response = readResponse(request);
      var code = response && response.data && typeof response.data.code === 'string' ? response.data.code : '';

      busy = false;

      if (request.status === 200 && response && (response.outcome === 'accepted' || response.outcome === 'repeat')) {
        application = {
          name: response.name,
          phone: response.phone,
          writeAllowed: response.writeAllowed === true,
          submittedAtText: response.submittedAtText || {}
        };
        language = response.language === 'uz' ? 'uz' : 'ru';
        show(response.outcome);

        return;
      }

      // Сотрудник и участник заявку не подают: проверка движка после перезагрузки покажет их экран.
      if (request.status === 403 || request.status === 409) {
        window.location.reload();

        return;
      }

      // Строку контакта сервер не принял — повтор той же строкой не поможет никогда: экран заявки
      // с вписанным именем, и «Отправить заявку» откроет окно номера заново.
      if (request.status === 401 && code === 'contact_rejected') {
        lastBody = null;
        declined = false;
        show('form');

        return;
      }

      // Сеть, сервер, таймаут и остальные отказы — сбой с повтором тем же телом.
      show('failed');
    }

    function send(body) {
      var request = new XMLHttpRequest();
      var finished = false;
      var timer;

      function finish() {
        if (finished) {
          return;
        }

        finished = true;
        clearTimeout(timer);
        onSent(request);
      }

      lastBody = body;
      busy = true;
      apply();

      request.open('POST', '/api/miniapp/applications', true);
      request.setRequestHeader('Content-Type', 'application/json');
      request.setRequestHeader('Accept', 'application/json');
      request.setRequestHeader('${INIT_DATA_HEADER}', context.initData);
      request.onreadystatechange = function () {
        if (request.readyState === 4) {
          finish();
        }
      };
      timer = setTimeout(function () {
        if (finished) {
          return;
        }

        finished = true;
        try {
          request.abort();
        } catch (error) {
          // Запрос уже закончился — сбой всё равно показывается.
        }
        busy = false;
        show('failed');
      }, SEND_TIMEOUT_MS);

      try {
        request.send(JSON.stringify(body));
      } catch (error) {
        finished = true;
        clearTimeout(timer);
        busy = false;
        show('failed');
      }
    }

    /**
     * «Отправить заявку»: окно номера, окно «Разрешить боту писать» — если писать ещё нельзя, —
     * и отправка. «Отмена» в окне номера — объяснение над кнопкой; закрытие свайпом не зовёт
     * ничего, и кнопка просто остаётся нажимаемой.
     */
    function onSubmitClick() {
      var candidateName = nameValue;
      var bodyLanguage = language;

      if (!isReady()) {
        return;
      }

      if (manual) {
        send({ name: candidateName, contactData: null, manualPhone: phoneValue, writeAccessGranted: false, language: bodyLanguage });

        return;
      }

      webApp.requestContact(function (shared, contact) {
        var signedContact;
        var user = webApp.initDataUnsafe ? webApp.initDataUnsafe.user : null;

        if (!shared || !contact || contact.status !== 'sent' || typeof contact.response !== 'string' || contact.response === '') {
          declined = true;
          apply();

          return;
        }

        declined = false;
        signedContact = contact.response;

        // Писать уже можно — второе окно незачем: ответ сервер возьмёт из initData.
        if ((user && user.allows_write_to_pm === true) || typeof webApp.requestWriteAccess !== 'function') {
          send({ name: candidateName, contactData: signedContact, manualPhone: null, writeAccessGranted: false, language: bodyLanguage });

          return;
        }

        // «Не разрешать» — заявка уходит всё равно, менеджер позвонит.
        webApp.requestWriteAccess(function (granted) {
          send({ name: candidateName, contactData: signedContact, manualPhone: null, writeAccessGranted: granted === true, language: bodyLanguage });
        });
      });
    }

    /** «Отправить заявку ещё раз» — то же тело, без окон Telegram. */
    function onRetryClick() {
      if (lastBody !== null && !busy) {
        send(lastBody);
      }

      return false;
    }

    function bindForm() {
      var nameInput = byId('xb-name');
      var phoneInput = byId('xb-phone');

      nameInput.value = nameValue;
      phoneInput.value = phoneValue;
      nameInput.oninput = function () {
        nameValue = nameInput.value;
        apply();
      };
      phoneInput.oninput = function () {
        phoneValue = phoneInput.value;
        apply();
      };
      nameInput.onfocus = focusField('xb-name-field', true);
      nameInput.onblur = focusField('xb-name-field', false);
      phoneInput.onfocus = focusField('xb-phone-field', true);
      phoneInput.onblur = focusField('xb-phone-field', false);
      byId('xb-send').onclick = onSubmitClick;
    }

    function bindOutcome() {
      var links = root.querySelectorAll('a.map');
      var index;

      for (index = 0; index < links.length; index++) {
        links[index].onclick = context.onExternalLinkClick;
      }
      byId('xb-write').onclick = onWriteClick;
      if (view === 'failed') {
        byId('xb-send').onclick = onRetryClick;
      }
    }

    function show(next) {
      var buttons, index;

      view = next;
      useStyle(view === 'form' ? 'form' : 'outcome');
      root.innerHTML = view === 'form' ? formHtml() : outcomeHtml();

      buttons = root.querySelectorAll('.seg button');
      for (index = 0; index < buttons.length; index++) {
        buttons[index].onclick = onLanguageClick;
      }

      if (view === 'form') {
        bindForm();
      } else {
        bindOutcome();
      }

      apply();
      window.scrollTo(0, 0);
    }

    document.body.appendChild(root);
    show(view);
    window.onresize = fit;

    if (webApp) {
      try {
        webApp.ready();
        webApp.expand();
      } catch (error) {
        // Клиент без этих вызовов: экран всё равно на месте.
      }
    }
  };
})();
`;
