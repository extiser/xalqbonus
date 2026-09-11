/**
 * Параметры бота: токен, режим доставки апдейтов и адрес с секретом для webhook.
 *
 * Умолчаний здесь нет ни у чего, кроме самого факта выключенного бота. Окружение задаёт
 * режим явно: `polling`, случайно доставшийся серверу, снял бы webhook у своего токена
 * молча — у токена Telegram ровно один приёмник апдейтов (docs/decisions.md →
 * «Тестовых ботов два: локальный на polling, стендовый на webhook»).
 */

/** Режимы доставки апдейтов. Третьего у Telegram нет. */
export type BotMode = 'polling' | 'webhook';

export type BotConfig = {
  token: string;
  mode: BotMode;
  /** Адрес, на который Telegram шлёт апдейты. Заполнен только в режиме `webhook`. */
  webhookUrl: string;
  /** Значение заголовка `X-Telegram-Bot-Api-Secret-Token`. Заполнен только в режиме `webhook`. */
  webhookSecret: string;
};

const isBotMode = (value: string): value is BotMode => value === 'polling' || value === 'webhook';

/**
 * Значение переменной окружения, пустая строка вместо отсутствующей.
 *
 * Читается `process.env`, а не `runtimeConfig`: `nuxt.config.ts` исполняется на сборке,
 * а образ собирается на машине без `.env` в окружении сборки — в бандл запеклась бы пустая
 * строка. Рантайм-переопределение у Nitro работает только через префикс `NUXT_`
 * (`tgBotToken` ← `NUXT_TG_BOT_TOKEN`), а `.env` один на приложение и воркер, где
 * `useRuntimeConfig` не существует вовсе (issue #61).
 */
const readEnv = (name: string): string => (process.env[name] ?? '').trim();

/**
 * Токен бота отдельно от остальных параметров.
 *
 * Нужен воркеру: тот шлёт исходящие сообщения и о режиме доставки апдейтов не знает
 * ничего — ни webhook, ни polling его не касаются, и падать из-за незаполненного
 * `TG_BOT_MODE` отправка уведомления не должна. Пустая строка означает выключенного бота,
 * ровно как и в `readBotConfig`.
 */
export const readBotToken = (): string => readEnv('TG_BOT_TOKEN');

/**
 * Читает параметры бота из окружения.
 *
 * `null` означает выключенного бота, а не ошибку: пустой `TG_BOT_TOKEN` — рабочее состояние
 * машины, на которую задача выкатывается раньше, чем на ней появляется токен. Всё остальное
 * поднимает исключение и роняет старт: бот, поднявшийся не в том режиме или без секрета,
 * ломается молча, и в логах об этом нет ни строки.
 */
export const readBotConfig = (): BotConfig | null => {
  const token = readBotToken();

  if (token === '') {
    return null;
  }

  const mode = readEnv('TG_BOT_MODE');

  if (!isBotMode(mode)) {
    throw new Error(
      `TG_BOT_MODE должен быть «polling» или «webhook», получено «${mode}»: режим выбирается окружением явно`,
    );
  }

  const webhookUrl = readEnv('TG_WEBHOOK_URL');
  const webhookSecret = readEnv('TG_WEBHOOK_SECRET');

  if (mode === 'webhook' && webhookUrl === '') {
    throw new Error('TG_WEBHOOK_URL обязателен в режиме webhook: без адреса Telegram некуда слать апдейты');
  }

  // Наличие секрета проверяется здесь, а не сверкой с Telegram: `getWebhookInfo` секрет
  // не возвращает вовсе. Без секрета ручка приёма остаётся вообще без защиты — пароля
  // nginx на ней нет и не будет (docker/DEPLOY-MANUAL.md → «Webhook не прячется за пароль»).
  if (mode === 'webhook' && webhookSecret === '') {
    throw new Error(
      'TG_WEBHOOK_SECRET обязателен в режиме webhook: это единственная защита ручки приёма апдейтов',
    );
  }

  return { token, mode, webhookUrl, webhookSecret };
};
