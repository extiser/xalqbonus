import { consola } from 'consola';
import type { Bot, Context } from 'grammy';
import type { Message, User } from 'grammy/types';

import { enqueueScreen } from '#server/bot/state';
import { advanceChatDraft, type ChatDraftMessage } from '#server/services/candidates/advanceChatDraft';
import { readCandidateMessageKind } from '#server/services/candidates/candidateMessageKind';
import type { ChatDraftReply } from '#server/services/candidates/chatDraftReplies';
import { findChatDraftForMessage } from '#server/services/candidates/findChatDraftForMessage';
import { resolveChatDraftStart } from '#server/services/candidates/resolveChatDraftStart';
import { startChatDraft } from '#server/services/candidates/startChatDraft';
import { preferredLanguage } from '#server/utils/language';

/**
 * Заявка кандидата в чате бота (issue #467, docs/decisions.md → «Заявка в чате бота»): `/start`
 * по метке рекламы — бот просит номер кнопкой клавиатуры, потом имя текстом, и заводит ту же
 * заявку, что Mini App.
 *
 * Обработчики только разбирают апдейт и зовут сервисы. Решение «заявка или дальше по цепочке»
 * принимается до очереди чата; шаг черновика читается и пишется внутри неё (server/bot/state.ts →
 * `enqueueScreen`): в режиме webhook контакт и имя приходят отдельными запросами, и без очереди
 * второе прочло бы шаг до того, как первое его сдвинуло. `next()` внутри очереди не зовётся:
 * приветствие встаёт в ту же очередь чата и ждало бы само себя.
 */

const log = consola.withTag('bot:application');

/** `/start` — с параметром или без, с именем бота или без: его разбирает обработчик команды. */
const START_COMMAND = /^\/start(@\w+)?(\s|$)/;

const isStartCommand = (message: Message): boolean => START_COMMAND.test(message.text ?? '');

/** Имя и фамилия из Telegram через пробел. */
const telegramNameOf = (user: User): string => `${user.first_name} ${user.last_name ?? ''}`.trim();

/** Ответ в личку кандидата в разметке HTML — подстановки текстов уже экранированы. */
const replyOf =
  (context: Context): ChatDraftReply =>
  async (messageText, replyMarkup) => {
    const sent = await context.reply(messageText, {
      parse_mode: 'HTML',
      ...(replyMarkup === null ? {} : { reply_markup: replyMarkup }),
    });

    return sent.message_id;
  };

/** Сообщение кандидата для шага черновика. */
const draftMessageOf = (message: Message & { from: User }): ChatDraftMessage | null => {
  const content = readCandidateMessageKind(message);

  if (content === null) {
    return null;
  }

  return {
    telegramUserId: BigInt(message.from.id),
    telegramChatId: BigInt(message.chat.id),
    telegramName: telegramNameOf(message.from),
    telegramUsername: message.from.username ?? null,
    messageId: message.message_id,
    content,
    contact:
      message.contact === undefined
        ? null
        : {
            userId: message.contact.user_id === undefined ? null : BigInt(message.contact.user_id),
            phoneNumber: message.contact.phone_number,
          },
  };
};

export const registerCandidateApplicationChatHandlers = (bot: Bot): void => {
  bot.chatType('private').command('start', async (context, next) => {
    const { from } = context;
    const telegramUserId = BigInt(from.id);
    const promoCode = await resolveChatDraftStart(telegramUserId, context.match.trim());

    if (promoCode === null) {
      await next();

      return;
    }

    const chatId = BigInt(context.chat.id);
    const outcome = await enqueueScreen(chatId, () =>
      startChatDraft({
        telegramUserId,
        telegramChatId: chatId,
        telegramName: telegramNameOf(from),
        telegramUsername: from.username ?? null,
        promoCode,
        language: preferredLanguage(from.language_code),
        now: new Date(),
        reply: replyOf(context),
      }),
    );

    log.info('заявка в чате: /start', { chatId: chatId.toString(), promoCode, outcome });
  });

  bot.chatType('private').on('message', async (context, next) => {
    const { message } = context;

    // `/start` черновику не принадлежит: его разобрал обработчик выше или он ушёл в приветствие.
    if (isStartCommand(message)) {
      await next();

      return;
    }

    const draftMessage = draftMessageOf(message);
    const draft = draftMessage === null ? null : await findChatDraftForMessage(BigInt(message.from.id));

    if (draftMessage === null || draft === null) {
      await next();

      return;
    }

    const outcome = await enqueueScreen(draftMessage.telegramChatId, () =>
      advanceChatDraft({ draftId: draft.id, message: draftMessage, now: new Date(), reply: replyOf(context) }),
    );

    log.info('заявка в чате: сообщение черновика', {
      draftId: draft.id,
      kind: draftMessage.content.kind,
      outcome,
    });
  });
};
