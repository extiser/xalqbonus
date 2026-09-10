import { consola } from 'consola';
import { InlineKeyboard, Keyboard, type Bot, type Context } from 'grammy';

import { forgetLanguage, recallLanguage, rememberLanguage } from '#server/bot/state';
import { comeToOfficeText, formatPoints, text } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import { readLinkedDriver, type LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import {
  registerDriverByContact,
  type RegistrationResult,
} from '#server/services/drivers/registerDriverByContact';

/**
 * Регистрация водителя в боте: язык, телефон, привязка.
 *
 * Обработчики — вход, а не место, где живут правила: они разбирают апдейт, зовут сервис
 * и рисуют ответ. Решение о том, привязывать или отправить в офис, целиком принимает
 * `registerDriverByContact` (docs/principles.md → «Слои и зависимости»).
 *
 * Порядок экранов:
 *
 *   1. `/start` — активная привязка есть, значит водитель уже участник: главное меню,
 *      телефон второй раз не спрашивается. Нет — выбор языка;
 *   2. язык выбран — экран «пришлите номер» с кнопкой запроса контакта. Выбор языка
 *      до базы не доезжает: человек ещё не участник, и строки `person_settings` у него нет;
 *   3. пришёл контакт — сервис решает исход, обработчик показывает один из трёх ответов:
 *      успех, «в офис» или «попробуйте позже».
 *
 * Отказы «в офис» не различаются текстом намеренно: «номер не найден» против «уже
 * привязан» отвечает любому, кто знает номер коллеги, состоит ли тот в программе.
 */

const log = consola.withTag('bot:registration');

/**
 * Язык до выбора. Экран выбора двуязычен сам по себе, но сообщение чем-то отправить надо,
 * а служебные ответы до выбора приходят на русском — как в старом боте.
 */
const DEFAULT_LANGUAGE: Language = 'ru';

/** Языки, между которыми выбирает водитель. `callback_data` строится отсюда же. */
const LANGUAGES = ['ru', 'uz'] as const;

/**
 * Клавиатура запроса контакта.
 *
 * Номер, введённый руками, не принимается ни в каком виде: подтверждённым является только
 * контакт из Telegram (docs/drivers.md → «Телефон подтверждает только сам владелец»).
 * Поэтому кнопка — единственный способ пройти этот шаг.
 */
const contactKeyboard = (language: Language) =>
  new Keyboard().requestContact(text('button_send_phone', language)).resized().oneTime();

/** Снимает клавиатуру запроса контакта: у привязанного водителя эта кнопка лишняя. */
const REMOVE_KEYBOARD = { remove_keyboard: true } as const;

const languageKeyboard = (): InlineKeyboard =>
  new InlineKeyboard()
    .text(text('button_language_ru', 'ru'), 'language:ru')
    .text(text('button_language_uz', 'uz'), 'language:uz');

/**
 * Главное меню участника: имя и баланс. Ничего другого бот пока не умеет.
 *
 * Язык берётся его собственный — тот, что лежит в `person_settings` с регистрации,
 * а не тот, который он мог только что нажать на старом сообщении.
 */
const showMainMenu = async (context: Context, driver: LinkedDriver): Promise<void> => {
  await context.reply(
    text('linked', driver.language, {
      name: driver.name,
      points: formatPoints(driver.points),
    }),
    { parse_mode: 'HTML', reply_markup: REMOVE_KEYBOARD },
  );
};

const showLanguageChoice = async (context: Context): Promise<void> => {
  await context.reply(text('select_language', DEFAULT_LANGUAGE), {
    reply_markup: languageKeyboard(),
  });
};

const showPhoneRequest = async (context: Context, language: Language): Promise<void> => {
  await context.reply(text('ask_phone', language), { reply_markup: contactKeyboard(language) });
};

/**
 * Ответ на исход регистрации.
 *
 * Клавиатура запроса контакта снимается у всех решений о водителе — и у успеха, и у «в
 * офис». Остаётся она ровно в двух случаях, и оба не являются решением: чужой контакт
 * («отправьте свой» — кнопкой, о которой и говорит текст) и молчащий Fleet API
 * («попробуйте через несколько минут» — тем же нажатием). Убрать её там значило бы
 * заставить водителя начинать с `/start` ради повторной попытки.
 */
const showOutcome = async (
  context: Context,
  language: Language,
  result: RegistrationResult,
): Promise<void> => {
  if (result.outcome === 'linked') {
    const key = result.isNewMember ? 'linked_new' : 'linked';

    // Языком участника, а не выбранным сейчас: у перенесённого из старой базы язык
    // в `person_settings` не перезаписывается, и экран успеха обязан говорить на том же,
    // на котором заговорит следующее сообщение.
    await context.reply(
      text(key, result.driver.language, {
        name: result.driver.name,
        points: formatPoints(result.driver.points),
      }),
      { parse_mode: 'HTML', reply_markup: REMOVE_KEYBOARD },
    );

    return;
  }

  if (result.outcome === 'contact_not_own') {
    await context.reply(text('contact_not_own', language), {
      reply_markup: contactKeyboard(language),
    });

    return;
  }

  if (result.outcome === 'park_api_unavailable') {
    await context.reply(text('park_api_unavailable', language), {
      reply_markup: contactKeyboard(language),
    });

    return;
  }

  await context.reply(comeToOfficeText(language), {
    parse_mode: 'HTML',
    // Ссылки на карту — единственное, ради чего разметка и нужна; разворачивать их
    // превью незачем, оно занимает пол-экрана на каждый офис.
    link_preview_options: { is_disabled: true },
    reply_markup: REMOVE_KEYBOARD,
  });
};

/** Chat id апдейта. Пусто у апдейтов без чата — до наших обработчиков такие не доходят. */
const chatIdOf = (context: Context): bigint | null =>
  context.chat === undefined ? null : BigInt(context.chat.id);

export const registerRegistrationHandlers = (bot: Bot): void => {
  bot.command('start', async (context) => {
    const chatId = chatIdOf(context);

    if (chatId === null) {
      return;
    }

    const driver = await readLinkedDriver(chatId);

    if (driver) {
      // Телефон у привязанного водителя не спрашивается повторно, и второй строки
      // в `telegram_links` от повторного `/start` не появляется.
      await showMainMenu(context, driver);

      return;
    }

    // Повторный `/start` на шаге запроса телефона начинает с выбора языка заново:
    // прежний выбор перезапишется, когда водитель нажмёт кнопку.
    await showLanguageChoice(context);
  });

  // По обработчику на язык, а не один с разбором `callback_data`: значение приходит
  // от клиента, и разбирать его строкой значит завести место, куда клиент кладёт что хочет.
  for (const language of LANGUAGES) {
    bot.callbackQuery(`language:${language}`, async (context) => {
      const chatId = chatIdOf(context);
      // Кнопка нажата — Telegram ждёт ответа на callback, иначе она крутится у водителя
      // до таймаута.
      await context.answerCallbackQuery();

      if (chatId === null) {
        return;
      }

      const driver = await readLinkedDriver(chatId);

      // Кнопка выбора языка живёт в старом сообщении и нажимается когда угодно — в том
      // числе после привязки. Спрашивать у привязанного водителя телефон заново нельзя.
      if (driver) {
        await showMainMenu(context, driver);

        return;
      }

      rememberLanguage(chatId, language);
      await showPhoneRequest(context, language);
    });
  }

  bot.on('message:contact', async (context) => {
    const chatId = chatIdOf(context);

    if (chatId === null) {
      return;
    }

    const language = recallLanguage(chatId);

    // Языка нет — значит состояние диалога истекло или процесс перезапускался. Контакт
    // при этом не теряется молча: водитель выбирает язык и нажимает кнопку ещё раз.
    // Подставить русский за него нельзя — это выбор, который поедет в `person_settings`.
    if (!language) {
      await showLanguageChoice(context);

      return;
    }

    const contact = context.message.contact;

    try {
      const result = await registerDriverByContact({
        telegramChatId: chatId,
        telegramUserId: context.from === undefined ? null : BigInt(context.from.id),
        // `user_id` пуст, если контакт не принадлежит пользователю Telegram: такой ничего
        // не подтверждает, и сервис его не примет.
        contactUserId: contact.user_id === undefined ? null : BigInt(contact.user_id),
        phoneRaw: contact.phone_number,
        language,
        // Поход в Fleet API занимает секунды, и водитель всё это время смотрит
        // на неотвеченное сообщение. Привязка после ответа продолжается сама.
        onLookupStarted: async () => {
          await context.reply(text('checking_phone', language));
        },
      });

      // Язык забывается только после удавшейся привязки: дальше он живёт
      // в `person_settings`. После неудачи он остаётся — повторная попытка идёт той же
      // кнопкой, без второго выбора языка.
      if (result.outcome === 'linked') {
        forgetLanguage(chatId);
      }

      await showOutcome(context, language, result);
    } catch (error) {
      // Сюда попадает то, чего мы не предусмотрели: недоступная база, отказ Telegram
      // на промежуточном сообщении. Отправлять человека в офис из-за нашей поломки нельзя —
      // показываем «попробуйте позже», а настоящую причину пишем в лог.
      log.error('обработка контакта упала', {
        chatId: chatId.toString(),
        error: error instanceof Error ? error.message : String(error),
      });

      await context.reply(text('park_api_unavailable', language), {
        reply_markup: contactKeyboard(language),
      });
    }
  });

  // Текст вместо контакта. Номер, введённый руками, не принимается ни в каком виде,
  // поэтому единственный полезный ответ — напоминание про кнопку.
  bot.on('message:text', async (context) => {
    const chatId = chatIdOf(context);

    if (chatId === null) {
      return;
    }

    const driver = await readLinkedDriver(chatId);

    if (driver) {
      await showMainMenu(context, driver);

      return;
    }

    const language = recallLanguage(chatId);

    if (!language) {
      await showLanguageChoice(context);

      return;
    }

    await showPhoneRequest(context, language);
  });
};
