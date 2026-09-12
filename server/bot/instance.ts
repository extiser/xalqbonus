import { consola } from 'consola';
import { Bot, webhookCallback } from 'grammy';
import type { Update } from 'grammy/types';
import type { BotConfig } from '#server/bot/config';
import { registerEmployeeInviteHandlers } from '#server/bot/employeeInvite';
import { registerGreetingHandlers } from '#server/bot/greeting';

const log = consola.withTag('bot');

/** Поднятый бот вместе с параметрами, на которых он поднят. */
export type BotRuntime = {
  bot: Bot;
  config: BotConfig;
  /**
   * Приём одного апдейта из HTTP-запроса. Собран только в режиме `webhook`: `webhookCallback`
   * подменяет `bot.start` заглушкой, бросающей исключение, и в режиме `polling` бот после
   * такой сборки уже не поднимется.
   */
  handleRequest: ((request: Request) => Promise<Response>) | null;
};

// Экземпляр один на процесс и держится на globalThis — по той же причине, что соединение
// с очередью: горячая перезагрузка в dev перевычисляет модуль, и второй бот с тем же токеном
// начал бы отбирать апдейты у первого.
const globalForBot = globalThis as typeof globalThis & { botRuntime?: BotRuntime };

// Вид апдейта: рядом с `update_id` у объекта Telegram ровно одно содержательное поле.
const updateKind = (update: Update): string =>
  Object.keys(update).find((key) => key !== 'update_id') ?? 'unknown';

/**
 * Обработчики апдейтов в том порядке, в котором они разбирают апдейт.
 *
 * Отдельной функцией и экспортом наружу — ради теста разведения приглашения и приветствия:
 * порядок здесь и есть то, что он проверяет, а собранный в тесте заново, он проверял бы
 * свою же копию (tests/integration/bot/greeting.test.ts).
 */
export const registerBotHandlers = (bot: Bot): void => {
  // Каждый принятый апдейт — строка в логе, до всякой обработки. В обоих режимах одна и та же:
  // это единственное место, где видно, что канал до Telegram живой.
  bot.use(async (context, next) => {
    log.info('апдейт принят', {
      updateId: context.update.update_id,
      kind: updateKind(context.update),
      chatId: context.chat?.id,
    });

    await next();
  });

  // Приглашение сотрудника: `/start inv_<токен>` и контакт следом. Идёт первым и уступает
  // приветствию всё, что к приглашению не относится, — и `/start` без параметра, и контакт
  // от чата, который ссылку не открывал (server/bot/employeeInvite.ts).
  registerEmployeeInviteHandlers(bot);

  // Всё, что осталось от водительской части: приветствие с кнопкой запуска приложения —
  // ответ на любое сообщение в личном чате. Идёт последним и отвечает на то, что не разобрал
  // никто до него (server/bot/greeting.ts).
  registerGreetingHandlers(bot);
};

const createBot = (config: BotConfig): Bot => {
  const bot = new Bot(config.token);

  registerBotHandlers(bot);

  // Ошибка обработчика в режиме polling: без своего обработчика grammY останавливает бота
  // на первом же исключении. В режиме webhook эта настройка не действует вовсе — там
  // исключение ловит ручка приёма (server/api/tg/webhook.post.ts).
  bot.catch((error) => {
    log.error('обработчик апдейта упал', {
      updateId: error.ctx.update.update_id,
      error: error.message,
    });
  });

  return bot;
};

/**
 * Поднимает бота или возвращает уже поднятого.
 *
 * Повторный вызов ничего не пересоздаёт: параметры читаются на старте процесса, смена
 * режима или токена — это перезапуск, а не правка на лету.
 */
export const createBotRuntime = (config: BotConfig): BotRuntime => {
  if (!globalForBot.botRuntime) {
    const bot = createBot(config);

    globalForBot.botRuntime = {
      bot,
      config,
      handleRequest:
        config.mode === 'webhook'
          ? webhookCallback(bot, 'std/http', { secretToken: config.webhookSecret })
          : null,
    };
  }

  return globalForBot.botRuntime;
};

/** Поднятый бот. `null`, пока бота нет: при пустом токене приложение работает без него. */
export const findBotRuntime = (): BotRuntime | null => globalForBot.botRuntime ?? null;
