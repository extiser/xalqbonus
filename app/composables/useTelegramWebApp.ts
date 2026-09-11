/**
 * Доступ к Telegram WebApp — тому объекту, который Telegram кладёт в страницу Mini App.
 *
 * Скрипт грузится с `telegram.org` и пакетом не заменяется: объект в страницу кладёт сам
 * клиент Telegram, и любая обёртка вокруг него была бы копией чужого протокола, которую
 * придётся догонять на каждой версии Bot API.
 *
 * Здесь описано только то, на что мы опираемся. Состав объекта у Telegram шире, и дописывать
 * сюда всё подряд незачем: непрочитанное поле — это поле, про которое никто не знает,
 * нужно оно нам или нет.
 */

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';

/**
 * Ответ на `requestContact`, снятый с живого прогона (`#81`, docs/miniapp.md).
 *
 * Документация Telegram обещает один статус и про подписанную строку молчит — а в `response`
 * лежит именно она, и именно она делает номер подтверждённым. Состав взят из прогона
 * на iOS, macOS и вебе, а не со страницы документации.
 */
export type TelegramContactResponse = {
  status: 'sent' | 'cancelled';
  /** Подписанная строка `contact=…&auth_date=…&hash=…`. Есть только при `sent`. */
  response?: string;
};

export type TelegramWebApp = {
  /** Подписанная строка с личностью. Пустая, если страницу открыли не из Telegram. */
  initData: string;
  /** Сообщает клиенту, что страница отрисована и заставку можно убирать. */
  ready: () => void;
  expand: () => void;
  /**
   * Запрос номера телефона. Доступен с Bot API 6.9 — на клиентах постарше поля нет вовсе,
   * поэтому необязательный.
   *
   * **Колбэк вызывается не всегда.** Согласие даёт `[true, { status: 'sent', response }]`,
   * отказ — `[false, { status: 'cancelled' }]`, а закрытие окна свайпом не вызывает ничего:
   * ни ответа, ни события. Экран обязан это переживать (docs/miniapp.md).
   */
  requestContact?: (
    callback: (shared: boolean, result?: TelegramContactResponse) => void,
  ) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/** Загрузка одна на страницу: второй тег скрипта дал бы второй объект и вторую личность. */
let loading: Promise<TelegramWebApp | null> | null = null;

/**
 * Объект Telegram WebApp или `null`, если его неоткуда взять.
 *
 * `null` — рабочий ответ, а не поломка: так выглядит страница, открытая в обычном браузере,
 * и отвечать на это исключением значило бы звать разбирать «ошибку приложения» там,
 * где всё в порядке — просто дверь не та (docs/principles.md → «Ошибки»).
 */
export const loadTelegramWebApp = (): Promise<TelegramWebApp | null> => {
  // На сервере окна нет вовсе, и личность там взять неоткуда: экран водителя целиком
  // клиентский.
  if (!import.meta.client) {
    return Promise.resolve(null);
  }

  if (loading) {
    return loading;
  }

  loading = new Promise((resolve) => {
    const existing = window.Telegram?.WebApp;

    if (existing) {
      resolve(existing);

      return;
    }

    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.addEventListener('load', () => resolve(window.Telegram?.WebApp ?? null));
    // Отказ загрузки — это отсутствующий объект, а не отдельное происшествие: экран
    // покажет то же самое, что и в обычном браузере.
    script.addEventListener('error', () => resolve(null));
    document.head.append(script);
  });

  return loading;
};
