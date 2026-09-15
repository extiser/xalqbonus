import { createError, type H3Error } from 'h3';

import {
  MailingAudienceEmptyError,
  MailingFieldTooLongError,
  MailingPhotoTooLargeError,
  MailingPhotoTypeNotAllowedError,
  MailingStatusMismatchError,
  MailingTextTooLongError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import { mailingTooLongText } from '#shared/mailing';
import { MAX_PHOTO_MB } from '#shared/photo';

/**
 * Что ответить сотруднику на доменный отказ ручки рассылок.
 *
 * Отказы — строками при своих правилах, а не кодами словаря двери: они про предмет разговора,
 * а не про доступ (docs/decisions.md → «Отказ двери веба говорит кодом, а текст живёт
 * словарём»). Собраны в одном месте, потому что ручек рассылок восемь, а отказов на всех
 * один набор, и восемь копий разошлись бы формулировкой.
 *
 * Фраза про перебор склейки берётся из `shared/mailing.ts`: та же стоит у закрытой кнопки
 * запуска в форме.
 *
 * `null` — не отказ, а поломка: такое уходит пятисоткой.
 */

const STATUS_ACTION_TEXT = {
  draft: 'Правится и запускается только черновик. Эта рассылка уже запущена.',
  running: 'Остановить можно только идущую рассылку.',
  stopped: 'Скопировать можно только остановленную рассылку.',
  finished: 'Действие для завершённой рассылки не предусмотрено.',
} as const;

const FIELD_TEXT = {
  textRu: 'Текст на русском',
  textUz: 'Текст на узбекском',
} as const;

const reject = (
  statusCode: 400 | 404 | 409 | 413 | 415,
  statusMessage: string,
  message: string,
): H3Error => createError({ statusCode, statusMessage, message });

export const explainMailingFailure = (error: unknown): H3Error | null => {
  if (error instanceof UnknownMailingError) {
    return reject(404, 'Not Found', 'Такой рассылки нет.');
  }

  if (error instanceof MailingStatusMismatchError) {
    return reject(409, 'Conflict', STATUS_ACTION_TEXT[error.expected]);
  }

  if (error instanceof MailingTextTooLongError) {
    return reject(400, 'Bad Request', mailingTooLongText(error.length, error.limit, error.withPhoto));
  }

  if (error instanceof MailingFieldTooLongError) {
    return reject(
      400,
      'Bad Request',
      `${FIELD_TEXT[error.field]} длиннее ${error.limit} знаков — больше Telegram не принимает даже без фото.`,
    );
  }

  if (error instanceof MailingAudienceEmptyError) {
    return reject(
      409,
      'Conflict',
      'Участников программы с привязанным Telegram сейчас нет — рассылать некому.',
    );
  }

  // 415 и 413 — как у фото товара: тело понято, не принимается тип или размер.
  if (error instanceof MailingPhotoTypeNotAllowedError) {
    return reject(415, 'Unsupported Media Type', 'Фото принимается в JPEG, PNG или WebP.');
  }

  if (error instanceof MailingPhotoTooLargeError) {
    return reject(413, 'Content Too Large', `Фото должно быть не больше ${MAX_PHOTO_MB} МБ.`);
  }

  return null;
};

/** Отказ в человеческом виде или исходная ошибка — для `catch` в ручке. */
export const rethrowMailingFailure = (error: unknown): never => {
  throw explainMailingFailure(error) ?? error;
};
