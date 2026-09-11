import { consola } from 'consola';
import { InlineKeyboard, type Bot, type Context } from 'grammy';

import { readMiniAppUrl } from '#server/bot/config';
import { sendScreen } from '#server/bot/screen';
import { text } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import { preferredLanguage } from '#server/utils/language';

/**
 * Всё, что осталось в боте от водительской части: `/start` с приветствием и кнопкой
 * запуска приложения.
 *
 * Регистрация уехала в Mini App целиком (`#86`). Телефон берётся там же и проверяется
 * подписью — той же схемой, что `initData`, — а значит пошаговый диалог в чате не давал
 * ничего, кроме двух десятков состояний и экранов: выбор языка, запрос контакта, разбор
 * присланного, шесть ответов «в офис» и ожидание между ними. Ничего из этого здесь больше
 * нет, и «на случай» не оставлено тоже: второй путь регистрации — это второе место, где
 * живут правила привязки (docs/miniapp.md → «Что остаётся в боте»).
 *
 * Контакт, присланный боту в чат, регистрацию не начинает и ответа не получает: такой
 * апдейт проходит мимо обработчиков насквозь.
 *
 * Язык берётся из настроек Telegram, а не выбором на экране: выбор живёт в приложении
 * и оттуда же уезжает в `person_settings`. Приветствие — единственное, что человек
 * успевает прочитать до него.
 */

const log = consola.withTag('bot:greeting');

/**
 * Кнопка запуска приложения.
 *
 * `undefined` на машине без `TG_MINIAPP_URL`: Telegram открывает Mini App только по `https`,
 * и подсунуть ему локальный адрес нечем. Приветствие при этом приходит целиком — оно
 * про кнопку под собой не говорит ни слова именно поэтому (server/bot/texts.ts).
 */
const launchKeyboard = (language: Language): InlineKeyboard | undefined => {
  const miniAppUrl = readMiniAppUrl();

  if (miniAppUrl === '') {
    return undefined;
  }

  return new InlineKeyboard().webApp(text('button_open_app', language), miniAppUrl);
};

/** Chat id апдейта. Пусто у апдейтов без чата — до наших обработчиков такие не доходят. */
const chatIdOf = (context: Context): bigint | null =>
  context.chat === undefined ? null : BigInt(context.chat.id);

export const registerGreetingHandlers = (bot: Bot): void => {
  bot.command('start', async (context) => {
    const chatId = chatIdOf(context);

    if (chatId === null) {
      return;
    }

    const language = preferredLanguage(context.from?.language_code);
    const keyboard = launchKeyboard(language);

    if (!keyboard) {
      log.warn('приветствие ушло без кнопки запуска: TG_MINIAPP_URL не задан', {
        chatId: chatId.toString(),
      });
    }

    // Через `sendScreen`, как и всё остальное: в чате живёт один экран бота, и три подряд
    // `/start` обязаны оставить одно приветствие, а не три (server/bot/screen.ts).
    await sendScreen(context, chatId, text('start_greeting', language), {
      reply_markup: keyboard,
    });
  });
};
