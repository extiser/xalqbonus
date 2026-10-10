import { text } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import { findOpenApplicationByPhone } from '#server/repositories/candidateApplications';
import {
  type CandidateChatDraftRow,
  closeChatDraft,
  findOpenChatDraftById,
  insertChatDraftMessage,
  recordChatDraftPhone,
} from '#server/repositories/candidateChatDrafts';
import type { CandidateMessageContent } from '#server/services/candidates/candidateMessageKind';
import {
  type ChatDraftReply,
  REMOVE_KEYBOARD,
  repeatText,
  sendPhoneKeyboard,
} from '#server/services/candidates/chatDraftReplies';
import {
  type SubmitChatApplicationOutcome,
  submitChatApplication,
} from '#server/services/candidates/submitChatApplication';
import { readMemberOffices } from '#server/services/offices/readMemberOffices';
import { readCandidateName } from '#shared/candidateApplications';
import { formatPhone, normalizePhoneE164 } from '#shared/phone';

/**
 * Сообщение кандидата в незаконченном черновике заявки в чате бота (issue #467): номер кнопкой,
 * потом имя текстом (docs/decisions.md → «Заявка в чате бота»).
 *
 * Сначала сообщение пишется в черновик — менеджер увидит, что человек писал и где остановился;
 * повтор апдейта отбивает уникальный индекс, и дальше не идёт ничего. Затем шаг — по черновику,
 * перечитанному здесь же: сервис зовут внутри очереди чата, и два быстрых сообщения не прочтут
 * один и тот же шаг.
 *
 * Бот отвечает на каждое ошибочное сообщение, сколько бы их ни было: шлёт их только сам
 * кандидат и только себе.
 */

/** Сообщение кандидата — то, что из апдейта нужно шагу. */
export type ChatDraftMessage = {
  telegramUserId: bigint;
  telegramChatId: bigint;
  /** Имя и фамилия из Telegram через пробел. */
  telegramName: string;
  telegramUsername: string | null;
  /** `message_id` в личке кандидата. */
  messageId: number;
  content: CandidateMessageContent;
  /** Контакт из сообщения; `userId` пуст у контакта без Telegram. */
  contact: { userId: bigint | null; phoneNumber: string } | null;
};

export type AdvanceChatDraftInput = {
  draftId: string;
  message: ChatDraftMessage;
  now: Date;
  reply: ChatDraftReply;
};

export type AdvanceChatDraftOutcome =
  /** Повтор апдейта — ответа нет. */
  | 'duplicate'
  /** Черновик закончили, пока сообщение ждало очереди. */
  | 'draft_closed'
  | 'contact_not_own'
  | 'phone_not_uz'
  | 'repeat'
  | 'awaiting_name'
  | 'use_button'
  | 'name_invalid'
  | SubmitChatApplicationOutcome;

/**
 * Номер не узбекский: телефон первого живого офиса, где он заполнен, — пусть кандидат позвонит.
 * Офиса с телефоном нет — текст без телефона.
 */
const phoneNotUzText = async (language: Language): Promise<string> => {
  const { offices } = await readMemberOffices({ isDemo: false });
  const phone = offices.find((office) => office.phone !== null && office.phone !== '')?.phone;

  return phone === undefined || phone === null
    ? text('application_chat_phone_not_uz_no_office', language)
    : text('application_chat_phone_not_uz', language, { phone: formatPhone(phone).display });
};

const advanceAwaitingContact = async (
  draft: CandidateChatDraftRow,
  input: AdvanceChatDraftInput,
): Promise<AdvanceChatDraftOutcome> => {
  const { contact, telegramUserId } = input.message;
  const { language } = draft;

  // Номер в чате — только кнопкой: набранный текстом не подтверждён ничем.
  if (contact === null) {
    await input.reply(text('application_chat_use_button', language), sendPhoneKeyboard(language));

    return 'use_button';
  }

  // Чужой контакт из вложений: номер подтверждает только его владелец.
  if (contact.userId !== telegramUserId) {
    await input.reply(text('application_chat_contact_not_own', language), sendPhoneKeyboard(language));

    return 'contact_not_own';
  }

  const phoneE164 = normalizePhoneE164(contact.phoneNumber);

  // Telegram шлёт номер аккаунта: после смены номера в настройках новая кнопка пройдёт обычным путём.
  if (phoneE164 === null) {
    await input.reply(await phoneNotUzText(language), sendPhoneKeyboard(language));

    return 'phone_not_uz';
  }

  const open = await findOpenApplicationByPhone(phoneE164);

  if (open) {
    await closeChatDraft(draft.id, open.id);
    await input.reply(repeatText(open, language, input.now), REMOVE_KEYBOARD);

    return 'repeat';
  }

  await recordChatDraftPhone(draft.id, { phoneRaw: contact.phoneNumber, phoneE164 });
  await input.reply(text('application_chat_ask_name', language), REMOVE_KEYBOARD);

  return 'awaiting_name';
};

const advanceAwaitingName = async (
  draft: CandidateChatDraftRow,
  input: AdvanceChatDraftInput,
): Promise<AdvanceChatDraftOutcome> => {
  const { content } = input.message;
  const name =
    content.kind === 'text' && content.text !== null && !content.text.startsWith('/')
      ? readCandidateName(content.text)
      : null;

  if (name === null) {
    await input.reply(text('application_chat_name_invalid', draft.language), null);

    return 'name_invalid';
  }

  const { phoneRaw, phoneE164 } = draft;

  if (phoneRaw === null || phoneE164 === null) {
    throw new Error(`черновик ${draft.id} ждёт имя без номера`);
  }

  return submitChatApplication({
    draft: { ...draft, phoneRaw, phoneE164 },
    telegramUserId: input.message.telegramUserId,
    telegramChatId: input.message.telegramChatId,
    telegramName: input.message.telegramName,
    telegramUsername: input.message.telegramUsername,
    name,
    now: input.now,
    reply: input.reply,
  });
};

export const advanceChatDraft = async (input: AdvanceChatDraftInput): Promise<AdvanceChatDraftOutcome> => {
  const { content, messageId } = input.message;
  const recorded = await insertChatDraftMessage({
    draftId: input.draftId,
    kind: content.kind,
    text: content.text,
    fileId: content.fileId,
    candidateMessageId: messageId,
  });

  if (!recorded) {
    return 'duplicate';
  }

  const draft = await findOpenChatDraftById(input.draftId);

  if (draft === null) {
    return 'draft_closed';
  }

  return draft.step === 'awaiting_contact' ? advanceAwaitingContact(draft, input) : advanceAwaitingName(draft, input);
};
