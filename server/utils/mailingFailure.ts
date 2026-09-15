import { createError, type H3Error } from 'h3';

import {
  MailingAudienceEmptyError,
  MailingFieldTooLongError,
  MailingNotLaunchableError,
  MailingPhotoTooLargeError,
  MailingPhotoTypeNotAllowedError,
  MailingRecallUnavailableError,
  MailingStatusMismatchError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import {
  MAILING_AUDIENCE_EMPTY_TEXT,
  mailingLaunchProblemText,
  mailingRecallProblemText,
} from '#shared/mailing';
import { MAX_PHOTO_MB } from '#shared/photo';

/**
 * Что ответить сотруднику на доменный отказ ручки рассылок.
 *
 * Отказы — строками при своих правилах, а не кодами словаря двери: они про предмет разговора,
 * а не про доступ (docs/decisions.md → «Отказ двери веба говорит кодом, а текст живёт
 * словарём»). Собраны в одном месте, потому что ручек рассылок десять, а отказов на всех
 * один набор, и девять копий разошлись бы формулировкой.
 *
 * Причины незапускаемой рассылки и фраза про пустую аудиторию берутся из `shared/mailing.ts`:
 * те же стоят у закрытой кнопки запуска на экране.
 *
 * `null` — не отказ, а поломка: такое уходит пятисоткой.
 */

const STATUS_ACTION_TEXT = {
  draft: 'Правится, запускается и удаляется только черновик. Эта рассылка уже запущена.',
  running: 'Остановить можно только идущую рассылку.',
  stopped: 'Идущую рассылку не скопировать — сначала остановите её.',
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

  // Все причины одним ответом — так же, как экран перечисляет их у кнопки.
  if (error instanceof MailingNotLaunchableError) {
    return reject(
      409,
      'Conflict',
      `Рассылку нельзя запустить. ${error.problems.map(mailingLaunchProblemText).join(' ')}`,
    );
  }

  if (error instanceof MailingFieldTooLongError) {
    return reject(
      400,
      'Bad Request',
      `${FIELD_TEXT[error.field]} длиннее ${error.limit} знаков — больше Telegram не принимает даже без фото.`,
    );
  }

  if (error instanceof MailingRecallUnavailableError) {
    return reject(409, 'Conflict', mailingRecallProblemText(error.problem));
  }

  if (error instanceof MailingAudienceEmptyError) {
    return reject(409, 'Conflict', MAILING_AUDIENCE_EMPTY_TEXT);
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
