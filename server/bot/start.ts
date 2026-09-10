import { consola } from 'consola';
import type { BotRuntime } from '#server/bot/instance';

const log = consola.withTag('bot');

/**
 * Ставит webhook только при расхождении с тем, что уже стоит у Telegram.
 *
 * Безусловный `setWebhook` на каждом рестарте — лишний запрос и лишний способ уронить
 * работающую доставку. Сверка идёт по адресу: секрет `getWebhookInfo` не возвращает вовсе,
 * такого поля у ответа нет, поэтому его непустоту проверяет наш же разбор окружения.
 * Следствие: смена одного лишь `TG_WEBHOOK_SECRET` при том же адресе до Telegram
 * не доедет — апдейты начнут приходить со старым секретом и получать 401 (со строкой в логе).
 */
const ensureWebhook = async (runtime: BotRuntime): Promise<void> => {
  const { bot, config } = runtime;
  const current = await bot.api.getWebhookInfo();

  if (current.url === config.webhookUrl) {
    log.info('webhook уже стоит на нашем адресе, setWebhook не вызывается', {
      url: config.webhookUrl,
      pendingUpdates: current.pending_update_count,
      lastError: current.last_error_message ?? null,
    });

    return;
  }

  // `drop_pending_updates` не передаётся намеренно: апдейты, накопленные за перезапуск,
  // теряться не должны. Умолчание метода — не сбрасывать.
  await bot.api.setWebhook(config.webhookUrl, { secret_token: config.webhookSecret });

  log.info('webhook переставлен', {
    from: current.url === undefined || current.url === '' ? null : current.url,
    to: config.webhookUrl,
  });
};

const startPolling = (runtime: BotRuntime): void => {
  const { bot, config } = runtime;

  // `bot.start()` возвращает промис, живущий до остановки бота, — дожидаться его нельзя,
  // иначе старт Nitro не завершится никогда. Webhook своего токена перед первым `getUpdates`
  // снимает сам grammY, с ретраями: пока за токеном числится webhook, `getUpdates` отвечает
  // 409. Чужие боты этим не задеваются — токен у каждого свой.
  void bot
    .start({
      onStart: (botInfo) => log.info('бот поднят', { mode: config.mode, username: botInfo.username }),
    })
    .catch((error: Error) => log.error('long polling остановлен ошибкой', { error: error.message }));
};

/** Поднимает бота в режиме, заданном окружением. */
export const startBot = async (runtime: BotRuntime): Promise<void> => {
  const { bot, config } = runtime;

  if (config.mode === 'polling') {
    startPolling(runtime);
    return;
  }

  // В режиме webhook `getUpdates` не зовётся вовсе, и `botInfo` некому заполнить:
  // без init бот не знает даже собственного имени.
  await bot.init();
  await ensureWebhook(runtime);

  log.info('бот поднят', { mode: config.mode, username: bot.botInfo.username });
};
