import { consola } from 'consola';

import {
  createTelegramForumTopic,
  sendTelegramMessage,
  TelegramSendError,
} from '#server/adapters/telegram/outgoing';
import { readBotToken, readCandidatesChatId } from '#server/bot/config';
import { text } from '#server/bot/texts';
import {
  type CandidateTopicCard,
  findCandidateTopicCard,
  recordApplicationTopic,
  recordApplicationTopicCard,
} from '#server/repositories/candidateApplications';
import {
  deleteCandidateMessage,
  hasBotCandidateMessage,
  insertCandidateMessage,
  markCandidateMessageDelivered,
  markCandidateMessageUndelivered,
} from '#server/repositories/candidateMessages';
import { postTopicNotice } from '#server/services/candidates/postTopicNotice';
import { cannotWriteText, topicCardText, topicName } from '#server/services/candidates/topicTexts';

/**
 * Тема, карточка и приветствие по заявке кандидата (issue #463) — задание очереди `candidates`.
 *
 * Шаги идут по порядку, и каждый сначала смотрит, не сделан ли он: повтор задания после сбоя
 * сделанное пропускает. Тема и карточка — для сотрудников, приветствие — кандидату, и группа
 * приветствию не нужна: без неё, заглушённой или сломанной, кандидат всё равно получает своё
 * (docs/decisions.md → «Переписка с кандидатом»).
 *
 * Сбой сети и лимит Telegram доезжают наверх и повторяются очередью. Отказ, который повтор
 * не чинит, — бот не администратор группы или запрос неверен, — шаг закрывает строкой в лог.
 */

const log = consola.withTag('candidates:topic');

export type OpenCandidateTopicInput = {
  applicationId: string;
  /** Адрес приложения — из него ссылка на заявку в админке. */
  appOrigin: string;
};

/** Чем кончилось приветствие. */
export type CandidateGreetingOutcome = 'sent' | 'refused' | 'failed' | 'already_done';

export type OpenCandidateTopicOutcome =
  | { outcome: 'bot_disabled' }
  | { outcome: 'missing' }
  | { outcome: 'done'; topicId: number | null; greeting: CandidateGreetingOutcome };

/** Повторяемый ли отказ: сеть, сбой Telegram и лимит — да, остальное — нет. */
const isRetryable = (error: TelegramSendError): boolean =>
  error.kind === 'transient' || error.kind === 'rate_limit';

/**
 * Тема в группе. Заявка возвращается с темой — или без неё, если группы нет, вызов заглушён
 * или Telegram отказал насовсем: тогда карточки не будет, а приветствие уйдёт.
 */
const ensureTopic = async (card: CandidateTopicCard, token: string): Promise<CandidateTopicCard> => {
  if (card.forumTopicId !== null) {
    return card;
  }

  const forumChatId = readCandidatesChatId();

  if (forumChatId === null) {
    log.warn('тема заявки не заведена: TG_CANDIDATES_CHAT_ID не задан', { applicationId: card.id });

    return card;
  }

  let forumTopicId: number | null;

  try {
    forumTopicId = await createTelegramForumTopic({
      token,
      telegramChatId: forumChatId,
      name: topicName(card.name, card.phoneE164),
    });
  } catch (error) {
    if (error instanceof TelegramSendError && !isRetryable(error)) {
      log.error('тема заявки не заведена: Telegram отказал', {
        applicationId: card.id,
        kind: error.kind,
        error: error.message,
      });

      return card;
    }

    throw error;
  }

  if (forumTopicId === null) {
    log.warn('тема заявки не заведена: группа вне TG_OUTGOING_ALLOWLIST', { applicationId: card.id });

    return card;
  }

  await recordApplicationTopic(card.id, forumChatId, forumTopicId);

  return { ...card, forumChatId, forumTopicId };
};

/** Карточка заявки — первое сообщение темы. */
const ensureCard = async (card: CandidateTopicCard, appOrigin: string, token: string): Promise<void> => {
  if (card.forumChatId === null || card.forumTopicId === null || card.topicCardMessageId !== null) {
    return;
  }

  try {
    const messageId = await sendTelegramMessage({
      token,
      telegramChatId: card.forumChatId,
      messageThreadId: card.forumTopicId,
      text: topicCardText(card, appOrigin),
    });

    await recordApplicationTopicCard(card.id, messageId);
  } catch (error) {
    if (error instanceof TelegramSendError && !isRetryable(error)) {
      log.error('карточка заявки не отправлена: Telegram отказал', {
        applicationId: card.id,
        kind: error.kind,
        error: error.message,
      });

      return;
    }

    throw error;
  }
};

/**
 * Приветствие кандидату. Строка пишется до отправки; сбой, который повторит очередь, строку
 * убирает — иначе повтор нашёл бы приветствие заведённым и пропустил.
 */
const ensureGreeting = async (card: CandidateTopicCard, token: string): Promise<CandidateGreetingOutcome> => {
  if (await hasBotCandidateMessage(card.id)) {
    return 'already_done';
  }

  const greeting = text('candidate_greeting', card.language, { name: card.name });
  const message = {
    applicationId: card.id,
    author: 'bot',
    employeeId: null,
    kind: 'text',
    text: greeting,
    fileId: null,
    candidateMessageId: null,
    topicMessageId: null,
  } as const;

  if (!card.writeAllowed) {
    const messageId = await insertCandidateMessage(message);

    if (messageId !== null) {
      await markCandidateMessageUndelivered(messageId, 'refused', 'cannot_write');
    }

    await postTopicNotice({ token, application: card, text: cannotWriteText(card.phoneE164) });

    return 'refused';
  }

  const messageId = await insertCandidateMessage(message);

  if (messageId === null) {
    // У сообщений бота уникального индекса нет, и вставка отбиться не может.
    throw new Error('строка приветствия кандидату не записана');
  }

  try {
    const candidateMessageId = await sendTelegramMessage({
      token,
      telegramChatId: card.telegramChatId,
      text: greeting,
    });

    await markCandidateMessageDelivered(messageId, { candidateMessageId });

    return 'sent';
  } catch (error) {
    if (!(error instanceof TelegramSendError)) {
      throw error;
    }

    if (isRetryable(error)) {
      await deleteCandidateMessage(messageId);

      throw error;
    }

    if (error.kind === 'invalid_chat') {
      await markCandidateMessageUndelivered(messageId, 'failed', 'cannot_write');
      await postTopicNotice({ token, application: card, text: cannotWriteText(card.phoneE164) });

      return 'failed';
    }

    // Запрос отклонён сам по себе: повтор ничего не изменит, очередь снимет задание.
    await markCandidateMessageUndelivered(messageId, 'failed', 'telegram_error');

    throw error;
  }
};

export const openCandidateTopic = async (input: OpenCandidateTopicInput): Promise<OpenCandidateTopicOutcome> => {
  const token = readBotToken();

  // Пустой токен — то же устройство, что у уведомлений (server/services/notifications/sendNotification.ts):
  // слать нечем, повторы упрутся в то же самое, а пропажа видна строкой ошибки.
  if (token === '') {
    log.error('тема и приветствие кандидата не отправлены: TG_BOT_TOKEN пуст', {
      applicationId: input.applicationId,
    });

    return { outcome: 'bot_disabled' };
  }

  const found = await findCandidateTopicCard(input.applicationId);

  if (!found) {
    log.error('заявки кандидата нет — тема не заводится', { applicationId: input.applicationId });

    return { outcome: 'missing' };
  }

  const card = await ensureTopic(found, token);

  await ensureCard(card, input.appOrigin, token);

  const greeting = await ensureGreeting(card, token);

  log.info('тема и приветствие кандидата', {
    applicationId: card.id,
    topicId: card.forumTopicId,
    greeting,
  });

  return { outcome: 'done', topicId: card.forumTopicId, greeting };
};
