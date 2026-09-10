import { consola } from 'consola';
import { readBotConfig, type BotConfig } from '#server/bot/config';
import { createBotRuntime } from '#server/bot/instance';
import { startBot } from '#server/bot/start';

const log = consola.withTag('bot');

// Разбор окружения с ошибкой в логе до того, как она уйдёт наверх: собранный образ печатает
// её стеком и падает, а dev-сервер Nitro отдаёт исключение плагина в ответ на первый запрос,
// и в терминале, где поднят стек, не остаётся ни строки.
const readBotConfigLoudly = (): BotConfig | null => {
  try {
    return readBotConfig();
  } catch (error) {
    log.error('бот не поднят: окружение задано неверно', {
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};

// Бот живёт в процессе приложения: отдельного контейнера под него нет, воркер BullMQ его
// не поднимает. Апдейты приходят в тот же процесс, что и веб — и webhook принимает обычная
// ручка Nitro (server/api/tg/webhook.post.ts).
export default defineNitroPlugin((nitroApp) => {
  // Окружение разбирается синхронно, до всякой сети: мусор в TG_BOT_MODE обязан ронять старт
  // процесса, а не всплывать необработанным промисом посреди уже работающего приложения.
  const config = readBotConfigLoudly();

  if (!config) {
    log.warn('TG_BOT_TOKEN пуст — бот не поднимается, приложение работает без него');
    return;
  }

  const runtime = createBotRuntime(config);

  nitroApp.hooks.hook('close', async () => {
    log.info('останов бота', { mode: config.mode });
    // Останавливает long polling и подтверждает смещение последнего апдейта. В режиме webhook
    // останавливать нечего, вызов безвреден.
    await runtime.bot.stop();
  });

  void startBot(runtime).catch((error: Error) => {
    log.error('бот не поднялся', { mode: config.mode, error: error.message });
  });
});
