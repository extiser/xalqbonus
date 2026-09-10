import { consola } from 'consola';
import { findBotRuntime } from '#server/bot/instance';

const log = consola.withTag('api:tg:webhook');

/**
 * Приём апдейтов от Telegram.
 *
 * Путь обязан оставаться ровно `/api/tg/webhook`: на боевой машине под него заведён
 * отдельный `location` nginx точным совпадением и без `auth_basic` — иначе Telegram получал
 * бы 401 на каждый апдейт (docker/DEPLOY-MANUAL.md → «Webhook не прячется за пароль»).
 *
 * Подлинность запроса проверяет само приложение по заголовку
 * `X-Telegram-Bot-Api-Secret-Token`, и это единственная защита ручки.
 */
export default defineEventHandler(async (event): Promise<Response> => {
  const runtime = findBotRuntime();

  if (!runtime?.handleRequest) {
    log.warn('апдейт пришёл, а бот не поднят в режиме webhook');
    return new Response('bot is not running', { status: 503 });
  }

  try {
    // Секрет сверяет сам grammY — сравнением за постоянное время, а не обычным `!==`:
    // посимвольное сравнение выдаёт длину совпавшего префикса временем ответа. Наше дело —
    // отказ, ушедший молча, заметить в логе.
    const response = await runtime.handleRequest(toWebRequest(event));

    if (response.status === 401) {
      log.warn('запрос без верного секретного заголовка отклонён', {
        ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
      });
    }

    return response;
  } catch (error) {
    // Упавший обработчик отвечает Telegram успехом, а не 500: на 5xx апдейт повторяется,
    // а детерминированная ошибка от повтора не чинится — растёт только очередь
    // недоставленного. `bot.catch` сюда не помогает, он действует лишь в режиме polling.
    log.error('обработка апдейта упала', {
      error: error instanceof Error ? error.message : String(error),
    });

    return new Response('ok', { status: 200 });
  }
});
