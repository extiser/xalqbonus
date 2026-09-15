import { createError, type H3Error } from 'h3';

import {
  InvalidActiveWithinDaysError,
  MailingAudienceEmptyError,
  MailingPhotoTooLargeError,
  MailingPhotoTypeNotAllowedError,
  MailingStatusMismatchError,
  MailingTextTooLongError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import { MAILING_ACTIVE_DAYS_MAX } from '#shared/mailing';
import { MAX_PHOTO_MB } from '#shared/photo';

/**
 * Что ответить сотруднику на доменный отказ ручки рассылок.
 *
 * Отказы — строками при своих правилах, а не кодами словаря двери: они про предмет разговора,
 * а не про доступ (docs/decisions.md → «Отказ двери веба говорит кодом, а текст живёт
 * словарём»). Собраны в одном месте, потому что ручек рассылок семь, а отказов на всех
 * один набор, и семь копий разошлись бы формулировкой.
 *
 * `null` — не отказ, а поломка: такое уходит пятисоткой.
 */

const STATUS_ACTION_TEXT = {
  draft: 'Правится и запускается только черновик. Эта рассылка уже запущена.',
  running: 'Остановить можно только идущую рассылку.',
  stopped: 'Скопировать можно только остановленную рассылку.',
  finished: 'Действие для завершённой рассылки не предусмотрено.',
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
    return reject(
      400,
      'Bad Request',
      `Сообщение вместе с заголовками языков — ${error.length} знаков, а Telegram принимает ` +
        `${error.withPhoto ? 'в подписи к фото' : 'в сообщении'} не больше ${error.limit}. ` +
        'Сократите тексты.',
    );
  }

  if (error instanceof InvalidActiveWithinDaysError) {
    return reject(
      400,
      'Bad Request',
      `Число дней — целое, от 1 до ${MAILING_ACTIVE_DAYS_MAX}. Пустое поле — все участники.`,
    );
  }

  if (error instanceof MailingAudienceEmptyError) {
    return reject(409, 'Conflict', 'По этому фильтру сейчас нет ни одного адресата — рассылать некому.');
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
