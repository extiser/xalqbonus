import { consola } from 'consola';
import { Bot, webhookCallback } from 'grammy';
import type { Update } from 'grammy/types';
import { registerCandidateApplicationChatHandlers } from '#server/bot/candidateApplicationChat';
import { registerCandidateChatHandlers } from '#server/bot/candidateChat';
import type { BotConfig } from '#server/bot/config';
import { registerDemoInviteHandlers } from '#server/bot/demoInvite';
import { registerEmployeeTelegramHandlers } from '#server/bot/employeeTelegram';
import { registerGreetingHandlers } from '#server/bot/greeting';
import { registerPromoTouchHandlers } from '#server/bot/promoTouch';

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
 * Отдельной функцией и экспортом наружу — ради теста разведения ссылок и приветствия:
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

  // Приглашение в демо: `/start demo_<токен>`, принимается сразу, без контакта. Уступает дальше
  // всё, что не про демо (server/bot/demoInvite.ts).
  registerDemoInviteHandlers(bot);

  // Привязка Telegram к учётке сотрудника: `/start emp_<токен>`, сразу, без контакта (issue #267).
  // Уступает дальше всё, что не про привязку (server/bot/employeeTelegram.ts). Приглашение
  // сотрудника бот больше не принимает — оно принимается в вебе, — и `/start inv_<токен>`
  // уходит в приветствие.
  registerEmployeeTelegramHandlers(bot);

  // Переход по промо-метке: `/start p_<код>` — строка в `promo_touches` (issue #377). Ответа
  // своего нет — уступает дальше всё, и метку тоже: водитель с плаката получает то же
  // приветствие, что и без неё (server/bot/promoTouch.ts).
  registerPromoTouchHandlers(bot);

  // Заявка кандидата в чате бота (issue #467): `/start` по метке рекламы — номер кнопкой, имя
  // текстом. После касания метки: к этому моменту оно уже записано. Перед перепиской с кандидатом:
  // сообщения незаконченного черновика не должны уйти в тему прошлой закрытой заявки. Всё, что
  // не про черновик, — участник, сотрудник, `/start` без метки рекламы — уступается дальше
  // (server/bot/candidateApplicationChat.ts).
  registerCandidateApplicationChatHandlers(bot);

  // Переписка с кандидатом (issue #463): сообщение кандидата в личке — копией в тему его заявки,
  // ответ сотрудника в теме группы кандидатов — кандидату. После касания метки: `/start p_<код>`
  // от кандидата пишет касание и проходит дальше, в приветствие. Перед приветствием: сообщения
  // кандидата ему не отвечаются, а всё, что не про кандидата, уступается дальше
  // (server/bot/candidateChat.ts).
  registerCandidateChatHandlers(bot);

  // Всё, что осталось от водительской части: приветствие с кнопкой запуска приложения —
  // ответ на любое сообщение в личном чате и на нажатие любой кнопки, в том числе кнопок
  // старого бота. Идёт последним и отвечает на то, что не разобрал никто до него
  // (server/bot/greeting.ts).
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
