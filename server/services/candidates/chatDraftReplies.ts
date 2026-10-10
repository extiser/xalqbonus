import { text } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import type { CandidateApplicationRow } from '#server/repositories/candidateApplications';
import { submittedDayText } from '#server/services/candidates/applicationScreen';

/**
 * Ответы бота в заявке из чата (issue #467): клавиатура «Отправить номер», её снятие и сообщение
 * «заявка уже отправлена» — общее у начала черновика, шага с номером и подачи.
 *
 * Сервисы заявки в чате grammY не знают: отправку получают параметром `reply`, обработчик
 * передаёт обёртку над `context.reply` с `parse_mode: 'HTML'`.
 */

/** Разметка ответа — клавиатура с кнопкой контакта или её снятие. */
export type ChatReplyMarkup =
  | {
      keyboard: { text: string; request_contact: true }[][];
      resize_keyboard: true;
      is_persistent: true;
    }
  | { remove_keyboard: true };

/** Отправляет ответ в личку кандидата и отдаёт его `message_id`. Текст — в разметке HTML. */
export type ChatDraftReply = (messageText: string, replyMarkup: ChatReplyMarkup | null) => Promise<number>;

/**
 * Клавиатура «Отправить номер». Постоянная: свёрнутая, она возвращается значком в поле ввода,
 * а номер в чате принимается только ею.
 */
export const sendPhoneKeyboard = (language: Language): ChatReplyMarkup => ({
  keyboard: [[{ text: text('button_send_phone', language), request_contact: true }]],
  resize_keyboard: true,
  is_persistent: true,
});

/** Снятие клавиатуры: номер получен или заявка уже есть — кнопка больше не нужна. */
export const REMOVE_KEYBOARD: ChatReplyMarkup = { remove_keyboard: true };

/** «{имя}, заявка уже отправлена {день}» — по открытой заявке, на заданном языке. */
export const repeatText = (application: CandidateApplicationRow, language: Language, now: Date): string =>
  text('application_chat_repeat', language, {
    name: application.name,
    date: submittedDayText(application.createdAt, now)[language],
  });
