import { consola } from 'consola';

import { sendTelegramMessage, TelegramSendError } from '#server/adapters/telegram/outgoing';

/**
 * Объяснение сотрудникам в теме кандидата (issue #463): почему сообщение кандидату не ушло
 * или почему бот не может ему писать.
 *
 * Отказ объяснения ничего не роняет и не повторяется: исход сообщения уже записан, а повтор
 * задания или апдейта нашёл бы его записанным и объяснение всё равно пропустил. Строка в лог.
 */

const log = consola.withTag('candidates:topic');

export type TopicNoticeInput = {
  token: string;
  application: { id: string; forumChatId: bigint | null; forumTopicId: number | null };
  text: string;
  /** Сообщение темы, на которое это — ответ. */
  replyToMessageId?: number;
};

export const postTopicNotice = async (input: TopicNoticeInput): Promise<void> => {
  const { application } = input;

  // Темы нет — объяснять некуда: приветствие кандидату ушло и без неё.
  if (application.forumChatId === null || application.forumTopicId === null) {
    return;
  }

  try {
    await sendTelegramMessage({
      token: input.token,
      telegramChatId: application.forumChatId,
      messageThreadId: application.forumTopicId,
      replyToMessageId: input.replyToMessageId,
      text: input.text,
    });
  } catch (error) {
    if (!(error instanceof TelegramSendError)) {
      throw error;
    }

    log.warn('объяснение в теме кандидата не отправлено', {
      applicationId: application.id,
      kind: error.kind,
      error: error.message,
    });
  }
};
