import { consola } from 'consola';
import { Keyboard, type Bot, type Context } from 'grammy';

import { sendScreen } from '#server/bot/screen';
import { forgetInviteToken, recallInviteToken, rememberInviteToken } from '#server/bot/state';
import { text, type TextKey } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import {
  acceptInvite,
  type AcceptInviteOutcome,
  type AcceptInviteResult,
} from '#server/services/employees/acceptInvite';
import { readInviteToken } from '#server/services/employees/inviteToken';
import { preferredLanguage } from '#server/utils/language';

/**
 * Приём приглашения сотрудника в боте: `/start inv_<токен>` и контакт следом.
 *
 * Обработчики регистрируются **до** приветствия и уступают ему `/start` без параметра
 * (`next()` в каждом отказе). Контакт от чата, который ссылку не открывал, тоже уходит
 * в `next()` и получает там приветствие — как любое другое сообщение (`#93`). Привязку
 * водителя он при этом не начинает: регистрация уехала в Mini App целиком (`#86`).
 *
 * Порядок именно такой и обратным быть не может: приветствие отвечает на всё подряд,
 * и стоя первым оно съело бы контакт приглашённого вместе с его учёткой.
 *
 * Правила целиком в сервисе: обработчик разбирает апдейт, зовёт `acceptInvite` и рисует
 * ответ (docs/principles.md → «Слои и зависимости»).
 *
 * Язык берётся из настроек Telegram, а не выбором на экране: сотрудник приходит по ссылке
 * от человека, который уже объяснил ему, что происходит, и лишний экран выбора здесь —
 * шаг, добавленный ради симметрии с водителем. Ошибиться языком не страшно: дальше
 * сотрудник работает в приложении, где язык выбирается настройкой.
 */

const log = consola.withTag('bot:invite');

/** Клавиатура запроса контакта. Номер руками не принимается и здесь: подтверждает Telegram. */
const contactKeyboard = (language: Language) =>
  new Keyboard().requestContact(text('button_send_phone', language)).resized().oneTime();

const REMOVE_KEYBOARD = { remove_keyboard: true } as const;

/** Язык из настроек Telegram. Правило одно на все двери — `server/utils/language.ts`. */
const languageOf = (context: Context): Language => preferredLanguage(context.from?.language_code);

const displayName = (context: Context): string =>
  [context.from?.first_name, context.from?.last_name].filter(Boolean).join(' ').trim();

/**
 * Текст на каждый отказ. Таблицей, а не цепочкой `if`: ответ у всех устроен одинаково
 * и отличается только ключом.
 *
 * Полнота таблицы обязательна и является настоящей защитой: новый исход `acceptInvite`
 * сломает сборку здесь и заставит написать текст. Запасное «что-то пошло не так» сломать
 * ничего не может — оно молча вернуло бы общее сообщение ровно там, где человек стоит
 * в офисе рядом с тем, кто выписал ссылку, и обоим нужно понять, что чинить.
 */
const REFUSAL_TEXT_KEYS: Readonly<Record<Exclude<AcceptInviteOutcome, 'accepted'>, TextKey>> = {
  not_found: 'invite_not_found',
  expired: 'invite_expired',
  already_accepted: 'invite_already_accepted',
  revoked: 'invite_revoked',
  contact_not_own: 'invite_contact_not_own',
  phone_invalid: 'invite_phone_invalid',
  driver_link_exists: 'invite_driver_link_exists',
  employee_exists: 'invite_employee_exists',
};

/**
 * Исходы, после которых повтор тем же действием осмыслен: человек прислал чужой контакт
 * или номер, который мы не разобрали. Токен в этих случаях остаётся, и второй контакт
 * идёт по той же ссылке.
 */
const RETRYABLE_OUTCOMES: ReadonlySet<AcceptInviteOutcome> = new Set([
  'contact_not_own',
  'phone_invalid',
]);

const chatIdOf = (context: Context): bigint | null =>
  context.chat === undefined ? null : BigInt(context.chat.id);

const showOutcome = async (
  context: Context,
  chatId: bigint,
  language: Language,
  result: AcceptInviteResult,
): Promise<void> => {
  if (result.outcome === 'accepted') {
    await sendScreen(context, chatId, text('invite_accepted', language, { name: displayName(context) }), {
      parse_mode: 'HTML',
      reply_markup: REMOVE_KEYBOARD,
    });

    return;
  }

  await sendScreen(context, chatId, text(REFUSAL_TEXT_KEYS[result.outcome], language), {
    // Клавиатура остаётся там, где повтор чинит дело: прислать свой контакт вместо чужого.
    // На окончательном отказе она снимается — вторая попытка по той же ссылке даст тот же
    // ответ, и кнопка звала бы человека в бессмысленное действие.
    reply_markup: RETRYABLE_OUTCOMES.has(result.outcome) ? contactKeyboard(language) : REMOVE_KEYBOARD,
  });
};

export const registerEmployeeInviteHandlers = (bot: Bot): void => {
  bot.command('start', async (context, next) => {
    const chatId = chatIdOf(context);
    const token = readInviteToken(context.match ?? '');

    // Не приглашение — апдейт уходит водительскому обработчику нетронутым.
    if (chatId === null || token === null) {
      await next();

      return;
    }

    // Проверка токена здесь не делается намеренно: ссылка проверяется вместе с контактом,
    // одним решением и в одной транзакции. Отвечать «приглашение просрочено» до того, как
    // человек нажал кнопку, значит проверять одно и то же дважды и разойтись в ответах.
    rememberInviteToken(chatId, token);

    log.info('открыта ссылка приглашения', { chatId: chatId.toString() });

    await sendScreen(context, chatId, text('invite_ask_contact', languageOf(context)), {
      reply_markup: contactKeyboard(languageOf(context)),
    });
  });

  bot.on('message:contact', async (context, next) => {
    const chatId = chatIdOf(context);
    const token = chatId === null ? null : recallInviteToken(chatId);

    // Контакт не по приглашению — это водитель, и разбирает его водительский обработчик.
    if (chatId === null || token === null) {
      await next();

      return;
    }

    const language = languageOf(context);
    const contact = context.message.contact;

    const result = await acceptInvite({
      token,
      telegramUserId: context.from === undefined ? null : BigInt(context.from.id),
      // `user_id` пуст, если контакт не принадлежит пользователю Telegram: такой ничего
      // не подтверждает, и сервис его не примет.
      contactUserId: contact.user_id === undefined ? null : BigInt(contact.user_id),
      phoneRaw: contact.phone_number,
      fullName: displayName(context),
    });

    if (!RETRYABLE_OUTCOMES.has(result.outcome)) {
      forgetInviteToken(chatId);
    }

    await showOutcome(context, chatId, language, result);
  });
};
