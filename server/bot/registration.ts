import { consola } from 'consola';
import { InlineKeyboard, Keyboard, type Bot, type Context } from 'grammy';

import { sendScreen } from '#server/bot/screen';
import { forgetLanguage, recallLanguage, rememberLanguage } from '#server/bot/state';
import { formatPoints, text, withOffices, type TextKey } from '#server/bot/texts';
import type { Language, LinkAttemptOutcome } from '#server/generated/prisma/enums';
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
 *   3. пришёл контакт — сервис решает исход, обработчик показывает ответ на него:
 *      успех, «попробуйте позже» или причину отказа со списком офисов под ней.
 *
 * Причины отказа разведены текстом (`#77`): из шести исходов «в офис» два решаются
 * не походом через город, а нажатием — водитель зашёл со второго аккаунта Telegram
 * или прислал не тот номер, — и узнать об этом он может только из ответа бота.
 *
 * Раньше они текстом не различались, и по делу: «номер не найден» против «уже привязан»
 * отвечало бы любому, кто знает номер коллеги, состоит ли тот в программе. Довод отпал
 * с `#64` — контакт принимается, только если принадлежит отправителю, и несовпадение
 * `contactUserId` с `telegramUserId` даёт `contact_not_own` до всякого поиска в реестре.
 * Прощупать чужой номер через бота нечем, и разведение текстов о постороннем человеке
 * не рассказывает ничего.
 *
 * Все экраны уходят через `sendScreen`: в чате живёт один экран бота, и прямых
 * `context.reply` здесь нет ни одного (server/bot/screen.ts).
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
const showMainMenu = async (
  context: Context,
  chatId: bigint,
  driver: LinkedDriver,
): Promise<void> => {
  await sendScreen(
    context,
    chatId,
    text('linked', driver.language, {
      name: driver.name,
      points: formatPoints(driver.points),
    }),
    { parse_mode: 'HTML', reply_markup: REMOVE_KEYBOARD },
  );
};

const showLanguageChoice = async (context: Context, chatId: bigint): Promise<void> => {
  await sendScreen(context, chatId, text('select_language', DEFAULT_LANGUAGE), {
    reply_markup: languageKeyboard(),
  });
};

const showPhoneRequest = async (
  context: Context,
  chatId: bigint,
  language: Language,
): Promise<void> => {
  await sendScreen(context, chatId, text('ask_phone', language), {
    reply_markup: contactKeyboard(language),
  });
};

/**
 * Исходы, доезжающие до ответа «в офис»: всё, кроме разобранного ранними возвратами
 * в `showOutcome` выше. Ровно ими индексируется таблица текстов.
 */
type OfficeOutcome = Exclude<
  LinkAttemptOutcome,
  'linked' | 'contact_not_own' | 'employee_account' | 'park_api_unavailable'
>;

/**
 * Текст на каждую причину отказа. Список офисов приклеивается к любому из них.
 *
 * Таблицей, а не цепочкой `if`: ответ у всех шести устроен одинаково и отличается
 * только ключом текста.
 *
 * Полнота таблицы стоит вместо запасного текста и является единственной настоящей
 * защитой: новое значение `LinkAttemptOutcome` обязано сломать сборку здесь и заставить
 * написать текст. Запасное «подойдите в офис» сломать ничего не может — оно молча
 * вернуло бы ровно то общее сообщение, ради избавления от которого заведён `#77`.
 */
const OFFICE_TEXT_KEYS: Readonly<Record<OfficeOutcome, TextKey>> = {
  not_in_registry: 'not_in_registry',
  not_in_park: 'not_in_park',
  profile_fired: 'profile_fired',
  several_profiles: 'several_profiles',
  person_already_linked: 'person_already_linked',
  telegram_already_linked: 'telegram_already_linked',
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
  chatId: bigint,
  language: Language,
  result: RegistrationResult,
): Promise<void> => {
  if (result.outcome === 'linked') {
    const key = result.isNewMember ? 'linked_new' : 'linked';

    // Языком участника, а не выбранным сейчас: у перенесённого из старой базы язык
    // в `person_settings` не перезаписывается, и экран успеха обязан говорить на том же,
    // на котором заговорит следующее сообщение.
    await sendScreen(
      context,
      chatId,
      text(key, result.driver.language, {
        name: result.driver.name,
        points: formatPoints(result.driver.points),
      }),
      { parse_mode: 'HTML', reply_markup: REMOVE_KEYBOARD },
    );

    return;
  }

  if (result.outcome === 'contact_not_own') {
    await sendScreen(context, chatId, text('contact_not_own', language), {
      reply_markup: contactKeyboard(language),
    });

    return;
  }

  // Сотруднику парка список офисов не нужен: он в офисе и работает, а нужное ему действие —
  // открыть приложение кнопкой меню. Клавиатура запроса контакта снимается: второй контакт
  // ответит тем же.
  if (result.outcome === 'employee_account') {
    await sendScreen(context, chatId, text('employee_account', language), {
      reply_markup: REMOVE_KEYBOARD,
    });

    return;
  }

  if (result.outcome === 'park_api_unavailable') {
    await sendScreen(context, chatId, text('park_api_unavailable', language), {
      reply_markup: contactKeyboard(language),
    });

    return;
  }

  await sendScreen(context, chatId, withOffices(OFFICE_TEXT_KEYS[result.outcome], language), {
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
      await showMainMenu(context, chatId, driver);

      return;
    }

    // Повторный `/start` на шаге запроса телефона начинает с выбора языка заново:
    // прежний выбор перезапишется, когда водитель нажмёт кнопку.
    await showLanguageChoice(context, chatId);
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
        await showMainMenu(context, chatId, driver);

        return;
      }

      rememberLanguage(chatId, language);
      await showPhoneRequest(context, chatId, language);
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
      await showLanguageChoice(context, chatId);

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
          await sendScreen(context, chatId, text('checking_phone', language));
        },
      });

      // Язык забывается только после удавшейся привязки: дальше он живёт
      // в `person_settings`. После неудачи он остаётся — повторная попытка идёт той же
      // кнопкой, без второго выбора языка.
      if (result.outcome === 'linked') {
        forgetLanguage(chatId);
      }

      await showOutcome(context, chatId, language, result);
    } catch (error) {
      // Сюда попадает то, чего мы не предусмотрели: недоступная база, отказ Telegram
      // на промежуточном сообщении. Отправлять человека в офис из-за нашей поломки нельзя —
      // показываем «попробуйте позже», а настоящую причину пишем в лог.
      log.error('обработка контакта упала', {
        chatId: chatId.toString(),
        error: error instanceof Error ? error.message : String(error),
      });

      await sendScreen(context, chatId, text('park_api_unavailable', language), {
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
      await showMainMenu(context, chatId, driver);

      return;
    }

    const language = recallLanguage(chatId);

    if (!language) {
      await showLanguageChoice(context, chatId);

      return;
    }

    await showPhoneRequest(context, chatId, language);
  });
};
