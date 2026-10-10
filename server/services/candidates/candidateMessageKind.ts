import type { Message } from 'grammy/types';

import type { CandidateMessageKind } from '#server/generated/prisma/enums';

/**
 * Вид сообщения переписки с кандидатом (issue #463) — по содержательному полю сообщения
 * Telegram, с текстом или подписью и `file_id` медиа.
 *
 * `null` — служебное сообщение: тема заведена, переименована, закрыта, кто-то вошёл в группу,
 * закреплено сообщение. В переписку оно не пишется и никуда не пересылается.
 */

export type CandidateMessageContent = {
  kind: CandidateMessageKind;
  /** Текст сообщения или подпись медиа, как пришли. */
  text: string | null;
  /** `file_id` медиа; у фото — самого крупного размера. */
  fileId: string | null;
};

/**
 * Содержательные поля, которых нет среди видов переписки: опрос, кубик, игра, история, счёт,
 * платное медиа. Сообщение с ними — `other`: кандидату оно не пересылается, но в переписке
 * видно, что что-то было.
 */
const OTHER_CONTENT_FIELDS = ['poll', 'dice', 'game', 'story', 'invoice', 'paid_media'] as const satisfies readonly (keyof Message)[];

const content = (kind: CandidateMessageKind, text: string | undefined, fileId: string | null): CandidateMessageContent => ({
  kind,
  text: text ?? null,
  fileId,
});

export const readCandidateMessageKind = (message: Message): CandidateMessageContent | null => {
  if (message.text !== undefined) {
    return content('text', message.text, null);
  }

  if (message.photo !== undefined) {
    // Размеры идут по возрастанию: последний — самый крупный.
    return content('photo', message.caption, message.photo.at(-1)?.file_id ?? null);
  }

  // Гифка раньше документа: у неё Telegram заполняет оба поля.
  if (message.animation !== undefined) {
    return content('animation', message.caption, message.animation.file_id);
  }

  if (message.video !== undefined) {
    return content('video', message.caption, message.video.file_id);
  }

  if (message.voice !== undefined) {
    return content('voice', message.caption, message.voice.file_id);
  }

  if (message.audio !== undefined) {
    return content('audio', message.caption, message.audio.file_id);
  }

  if (message.document !== undefined) {
    return content('document', message.caption, message.document.file_id);
  }

  if (message.sticker !== undefined) {
    return content('sticker', undefined, message.sticker.file_id);
  }

  if (message.video_note !== undefined) {
    return content('video_note', undefined, message.video_note.file_id);
  }

  if (message.contact !== undefined) {
    return content('contact', undefined, null);
  }

  // У места (`venue`) Telegram заполняет и `location`: оба — место.
  if (message.location !== undefined || message.venue !== undefined) {
    return content('location', undefined, null);
  }

  if (OTHER_CONTENT_FIELDS.some((field) => message[field] !== undefined)) {
    return content('other', undefined, null);
  }

  // Остальное — служебное: тема заведена, переименована, закрыта или открыта, участники
  // вошли или вышли, сообщение закреплено и всё, у чего содержания нет.
  return null;
};
