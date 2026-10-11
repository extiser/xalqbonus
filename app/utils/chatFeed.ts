import { formatCalendarDayWord, formatDayKey, formatWaitDuration } from '~/utils/format';
import type {
  ApplicationDraftMessage,
  CandidateMessageDelivery,
  CandidateMessageFailure,
  CandidateMessageKind,
  DraftMessage,
} from '#shared/types/applications';

/**
 * Лента переписки карточек раздела «Заявки» — заявки (issue #471) и человека из «Не закончили»
 * (issue #475): одна разметка, одни тексты. Карточка собирает свои сообщения и события в записи
 * с моментом, лента раскладывает их по времени и дням и дописывает в конце «Ждёт ответа».
 *
 * Медиа не показывается — вид словом и подпись. Недоставленное подписано под пузырём.
 */

export const KIND_WORDS: Readonly<Record<Exclude<CandidateMessageKind, 'text'>, string>> = {
  photo: 'Фото',
  video: 'Видео',
  animation: 'Гифка',
  voice: 'Голосовое',
  audio: 'Аудио',
  document: 'Файл',
  sticker: 'Стикер',
  video_note: 'Кружок',
  contact: 'Контакт',
  location: 'Место',
  other: 'Другое',
};

const FAILURE_TEXTS: Readonly<Record<CandidateMessageFailure, string>> = {
  no_topic: 'не попало в тему',
  cannot_write: 'бот не может писать кандидату',
  telegram_error: 'Telegram не принял',
};

/** Подпись недоставленного под пузырём; доставленное и ждущее отправки — без подписи. */
export const deliveryFailureText = (delivery: CandidateMessageDelivery, failure: CandidateMessageFailure | null): string | null => {
  if (delivery === 'refused') return 'не отправлено: кандидат не разрешил писать';
  if (delivery === 'failed' && failure !== null) return FAILURE_TEXTS[failure];

  return null;
};

/** Пузырь ленты: человек слева, сотрудники и бот справа. */
export type ChatFeedMessage = {
  tone: 'person' | 'employee' | 'bot';
  /** Вид не текста словом серым над текстом: «Фото», «Контакт». */
  kindWord: string | null;
  text: string | null;
  /** Кто написал — под пузырём. */
  author: string;
  createdAt: string;
  /** Почему не доставлено; `null` — доставлено или ждёт отправки. */
  failure: string | null;
};

export type ChatFeedItem =
  | { kind: 'day'; key: string; text: string }
  | { kind: 'event'; key: string; text: string; tone: 'quiet' | 'waiting' }
  | { kind: 'message'; key: string; message: ChatFeedMessage };

/** Запись карточки с моментом; при равном моменте порядок — как записи пришли. */
export type ChatFeedEntry = { at: number; item: Exclude<ChatFeedItem, { kind: 'day' }> };

/** Лента по времени, со строкой дня перед первым сообщением дня и ожиданием в конце. */
export const buildChatFeed = (entries: readonly ChatFeedEntry[], waiting: { since: string; now: number } | null): ChatFeedItem[] => {
  // Сортировка устойчива: событие, записанное после сообщения с тем же моментом, за ним и встанет.
  const sorted = [...entries].sort((left, right) => left.at - right.at);
  const result: ChatFeedItem[] = [];
  let lastDay = '';

  for (const { at, item } of sorted) {
    const day = formatDayKey(new Date(at));

    if (day !== lastDay) {
      result.push({ kind: 'day', key: `day-${day}`, text: formatCalendarDayWord(day) });
      lastDay = day;
    }

    result.push(item);
  }

  if (waiting !== null) {
    result.push({
      kind: 'event',
      key: 'waiting',
      text: `Ждёт ответа ${formatWaitDuration(waiting.now - new Date(waiting.since).getTime())}`,
      tone: 'waiting',
    });
  }

  return result;
};

/**
 * Записи одного черновика заявки в чате: событие «Нажал /start · метка» в его начале, сообщения
 * человека и ответы сотрудников, а сразу после контакта, по которому черновик взял номер, —
 * «Прислал номер · бот спросил имя». Под контактом номера — сам номер.
 */
export const draftFeedEntries = (
  messages: readonly DraftMessage[],
  draft: { startedAt: string; promoName: string | null; phone: string | null; personName: string },
): ChatFeedEntry[] => {
  const entries: ChatFeedEntry[] = [
    {
      at: new Date(draft.startedAt).getTime(),
      item: {
        kind: 'event',
        key: `started-${draft.startedAt}`,
        text: draft.promoName === null ? 'Нажал /start' : `Нажал /start · ${draft.promoName}`,
        tone: 'quiet',
      },
    },
  ];

  for (const message of messages) {
    const at = new Date(message.createdAt).getTime();

    entries.push({
      at,
      item: {
        kind: 'message',
        key: message.id,
        message: {
          tone: message.author === 'person' ? 'person' : 'employee',
          kindWord: message.kind === 'text' ? null : KIND_WORDS[message.kind],
          text: message.isPhoneMessage ? draft.phone : message.text,
          author: message.author === 'person' ? draft.personName : (message.authorName ?? 'Сотрудник'),
          createdAt: message.createdAt,
          failure: deliveryFailureText(message.delivery, message.failure),
        },
      },
    });

    if (message.isPhoneMessage) {
      entries.push({
        at,
        item: { kind: 'event', key: `phone-${message.id}`, text: 'Прислал номер · бот спросил имя', tone: 'quiet' },
      });
    }
  }

  return entries;
};

/**
 * Записи черновиков, которыми кончилась заявка, — до подачи. Сообщения приходят одним списком
 * по времени, с началом и меткой своего черновика: черновики различаются началом.
 */
export const applicationDraftFeedEntries = (
  messages: readonly ApplicationDraftMessage[],
  personName: string,
): ChatFeedEntry[] => {
  const drafts = new Map<string, ApplicationDraftMessage[]>();

  for (const message of messages) {
    drafts.set(message.startedAt, [...(drafts.get(message.startedAt) ?? []), message]);
  }

  return [...drafts.values()].flatMap((draftMessages) => {
    const first = draftMessages[0];

    return first === undefined
      ? []
      : draftFeedEntries(draftMessages, {
          startedAt: first.startedAt,
          promoName: first.promoName,
          phone: first.phone,
          personName,
        });
  });
};
