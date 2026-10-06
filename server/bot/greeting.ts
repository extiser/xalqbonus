import { consola } from 'consola';
import type { Bot, Context } from 'grammy';

import { openAppKeyboard } from '#server/adapters/telegram/outgoing';
import { launchButton } from '#server/bot/launchButton';
import { sendScreen } from '#server/bot/screen';
import { enqueueScreen } from '#server/bot/state';
import { text } from '#server/bot/texts';
import { isEmployeeTelegram } from '#server/services/employees/isEmployeeTelegram';
import { preferredLanguage } from '#server/utils/language';

/**
 * Всё, что осталось в боте от водительской части: приветствие с кнопкой запуска
 * приложения — единственный ответ на любое сообщение в личном чате и на нажатие любой
 * кнопки (issue #284).
 *
 * Регистрация уехала в Mini App целиком (`#86`). Телефон берётся там же и проверяется
 * подписью — той же схемой, что `initData`, — а значит пошаговый диалог в чате не давал
 * ничего, кроме двух десятков состояний и экранов: выбор языка, запрос контакта, разбор
 * присланного, шесть ответов «в офис» и ожидание между ними. Ничего из этого здесь больше
 * нет, и «на случай» не оставлено тоже: второй путь регистрации — это второе место, где
 * живут правила привязки (docs/miniapp.md → «Что остаётся в боте»).
 *
 * **Молчать боту нельзя.** Старый бот два года учил водителя присылать контакт в чат,
 * и привычка переживёт его выключение на месяцы. Человек, отправивший номер по этой
 * привычке, из молчания не узнаёт ничего: дошло или нет, сломалось или так задумано,
 * что делать дальше. Поэтому контакт — как и текст, фото, стикер, голосовое, пересланное —
 * получает приветствие; привязку он при этом по-прежнему не начинает (`#93`).
 *
 * Обработчик на всё это один, и `/start` идёт через него же: команда — такое же входящее
 * сообщение, а отдельная ветка для неё означала бы два приветствия, которым однажды
 * предстоит разойтись. Различать здесь нечего — ответ один.
 *
 * Язык берётся из настроек Telegram, а не выбором на экране: выбор живёт в приложении
 * и оттуда же уезжает в `person_settings`. Приветствие — единственное, что человек
 * успевает прочитать до него.
 *
 * **Сотрудник получает своё приветствие** с той же кнопкой: какой экран показать, приложение
 * решает само по той же личности (issue #122). Узнаётся он по `employees.telegram_user_id`
 * отправителя — той же проверкой, что стоит в правиле «одна роль на Telegram».
 */

const log = consola.withTag('bot:greeting');

/**
 * Текст служебного сообщения, снимающего клавиатуру. Один символ: пустой текст Telegram
 * не принимает, а прочитать его водитель не успеет — сообщение удаляется следом.
 */
const KEYBOARD_REMOVAL_TEXT = '·';

/** Chat id апдейта. Пусто у апдейтов без чата — нажатия под inline-сообщением. */
const chatIdOf = (context: Context): bigint | null =>
  context.chat === undefined ? null : BigInt(context.chat.id);

/** Причина отказа для строки лога. */
const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Снимает клавиатуру под полем ввода, оставленную старым ботом.
 *
 * Старый бот ставил её на экране запроса телефона — кнопка «отправить контакт»
 * с `one_time_keyboard` (`../xalqbonusbot/utils/constructor.js`), — и не снимал никогда:
 * «одноразовая» у Telegram значит только «свернуть после нажатия», значок в поле ввода
 * открывает её снова. Снять её может лишь бот, и лишь отправкой сообщения с `remove_keyboard`.
 *
 * Одним сообщением с приветствием нельзя: `reply_markup` у сообщения одна, и у приветствия
 * там кнопка приложения. Поэтому служебное сообщение уходит отдельно и сразу удаляется —
 * клавиатура снимается отправкой, удаление её не возвращает.
 *
 * Служебное сообщение уходит без звука: иначе телефон водителя вздрагивал бы на каждом
 * приветствии, а уведомление «·» успевало бы показаться до удаления.
 *
 * Без памяти «уже снимали»: приветствие редкое, и два лишних вызова дешевле состояния.
 * Неудача снятия приветствие не отменяет — строка в лог и дальше.
 */
const removeLegacyKeyboard = async (context: Context, chatId: bigint): Promise<void> => {
  let messageId: number;

  try {
    const message = await context.reply(KEYBOARD_REMOVAL_TEXT, {
      reply_markup: { remove_keyboard: true },
      disable_notification: true,
    });

    messageId = message.message_id;
  } catch (error) {
    log.warn('клавиатура старого бота не снялась', { chatId: chatId.toString(), error: reasonOf(error) });

    return;
  }

  try {
    await context.api.deleteMessage(chatId.toString(), messageId);
  } catch (error) {
    log.warn('служебное сообщение снятия клавиатуры не удалилось', {
      chatId: chatId.toString(),
      messageId,
      error: reasonOf(error),
    });
  }
};

/**
 * Приветствие с кнопкой запуска — одно на сообщение и на нажатие кнопки: два приветствия,
 * которым однажды предстоит разойтись, здесь ровно то, чего быть не должно.
 */
const sendGreeting = async (context: Context, chatId: bigint): Promise<void> => {
  const language = preferredLanguage(context.from?.language_code);
  const button = launchButton(language);

  if (!button) {
    log.warn('приветствие ушло без кнопки запуска: TG_MINIAPP_URL не задан', {
      chatId: chatId.toString(),
    });
  }

  const employee =
    context.from !== undefined && (await isEmployeeTelegram(BigInt(context.from.id)));

  // Снятие клавиатуры и приветствие встают в очередь чата подряд, без `await` между ними:
  // вклиниться между ними чужой отправке некуда (server/bot/state.ts → `enqueueScreen`).
  // Снятие не бросает — отказ уходит строкой в лог внутри него.
  const keyboardRemoved = enqueueScreen(chatId, () => removeLegacyKeyboard(context, chatId));

  // Через `sendScreen`, как и всё остальное: в чате живёт один экран бота, и десяток
  // сообщений подряд обязан оставить одно приветствие, а не десять (server/bot/screen.ts).
  const greeted = sendScreen(
    context,
    chatId,
    text(employee ? 'employee_greeting' : 'start_greeting', language),
    { reply_markup: openAppKeyboard(button) },
  );

  await Promise.all([keyboardRemoved, greeted]);
};

export const registerGreetingHandlers = (bot: Bot): void => {
  // Только личный чат: в группе то же правило превратило бы бота в отвечающего на каждую
  // реплику. Водитель приходит в личный чат, и правило написано про него.
  bot.chatType('private').on('message', async (context) => {
    const chatId = chatIdOf(context);

    if (chatId === null) {
      return;
    }

    await sendGreeting(context, chatId);
  });

  // Нажатие inline-кнопки. Своих `callback_data` у бота нет: кнопки в чатах водителей —
  // от старого бота, и после переключения их нажатия приходят сюда. Разбирать их незачем —
  // ответ на любое нажатие приветствие, как на сообщение. Идёт последним, как и приветствие
  // на сообщения: появится своя кнопка — её обработчик встанет раньше и сюда нажатие
  // не пустит.
  bot.on('callback_query', async (context) => {
    // Сначала — ответ на нажатие без текста: пока его нет, на кнопке у водителя крутится
    // индикатор загрузки. Нажатие из очереди, пролежавшее дольше срока, Telegram отбивает
    // (`query is too old`) — приветствие от этого не теряется.
    try {
      await context.answerCallbackQuery();
    } catch (error) {
      log.warn('нажатие кнопки не отвечено', {
        callbackQueryId: context.callbackQuery.id,
        error: reasonOf(error),
      });
    }

    // Без чата — нажатие под inline-сообщением, отвечать приветствием некуда. В группе —
    // то же правило, что для сообщений.
    const chatId = chatIdOf(context);

    if (chatId === null || context.chat?.type !== 'private') {
      return;
    }

    await sendGreeting(context, chatId);
  });
};
