import { createError, type H3Error } from 'h3';

import {
  GiftRecipientError,
  InvalidGiftGrantError,
  type GiftGrantProblem,
  type GiftRecipientProblem,
} from '#server/services/gifts/errors';
import { GIFT_REASON_MAX_LENGTH } from '#shared/gift';
import { MAX_PHOTO_MB } from '#shared/photo';
import type { GiftGrantField } from '#shared/types/rewards';

/**
 * Что ответить сотруднику на доменный отказ раздачи подарка (issue #219).
 *
 * Отказы — строками при своих правилах, а не кодами словаря двери: они про предмет разговора,
 * а не про доступ (docs/decisions.md → «Отказ двери веба говорит кодом, а текст живёт
 * словарём»). Код причины несёт ошибка сервиса, здесь он превращается в текст и поле формы,
 * рядом с которым текст встанет, — как у ручной выдачи награды.
 *
 * `null` — не отказ, а поломка: такое уходит пятисоткой.
 */

type Rejection = { status: 400 | 409; field: GiftGrantField; message: string };

const GRANT_PROBLEMS: Readonly<Record<GiftGrantProblem, Rejection>> = {
  points_invalid: { status: 400, field: 'points', message: 'Сумма — целое число баллов больше нуля.' },
  reason_ru_missing: {
    status: 400,
    field: 'reasonRu',
    message: 'Напишите повод на русском: водитель увидит его в приложении и в сообщении.',
  },
  reason_uz_missing: {
    status: 400,
    field: 'reasonUz',
    message: 'Напишите повод на узбекском: водитель увидит его в приложении и в сообщении.',
  },
  reason_ru_too_long: {
    status: 400,
    field: 'reasonRu',
    message: `Повод на русском — не длиннее ${GIFT_REASON_MAX_LENGTH} знаков: это строка карточки подарка.`,
  },
  reason_uz_too_long: {
    status: 400,
    field: 'reasonUz',
    message: `Повод на узбекском — не длиннее ${GIFT_REASON_MAX_LENGTH} знаков: это строка карточки подарка.`,
  },
  cover_type_invalid: { status: 400, field: 'cover', message: 'Обложка — JPEG, PNG или WebP.' },
  cover_too_large: { status: 400, field: 'cover', message: `Обложка тяжелее ${MAX_PHOTO_MB} МБ.` },
  until_date_invalid: { status: 400, field: 'untilDate', message: 'Дата не читается как день календаря.' },
  until_date_too_early: {
    status: 400,
    field: 'untilDate',
    message: '«Забрать до» — не раньше завтрашнего дня: в этот день незабранное зачислится само.',
  },
};

const RECIPIENT_PROBLEMS: Readonly<Record<GiftRecipientProblem, Rejection>> = {
  person_not_member: {
    status: 409,
    field: 'recipient',
    message: 'Водитель не в программе: баллы вне программы не копятся.',
  },
  segment_unknown: { status: 400, field: 'recipient', message: 'Такого сегмента нет.' },
  segment_archived: {
    status: 409,
    field: 'recipient',
    message: 'Сегмент в архиве — выберите рабочий или верните этот из архива.',
  },
  segment_no_members: {
    status: 409,
    field: 'recipient',
    message: 'В сегменте нет ни одного участника программы — дарить некому.',
  },
};

const reject = ({ status, field, message }: Rejection): H3Error =>
  createError({
    statusCode: status,
    statusMessage: status === 400 ? 'Bad Request' : 'Conflict',
    message,
    data: { field },
  });

export const explainGiftFailure = (error: unknown): H3Error | null => {
  if (error instanceof InvalidGiftGrantError) {
    return reject(GRANT_PROBLEMS[error.problem]);
  }

  if (error instanceof GiftRecipientError) {
    return reject(RECIPIENT_PROBLEMS[error.problem]);
  }

  return null;
};

/** Отказ в человеческом виде или исходная ошибка — для `catch` в ручке. */
export const rethrowGiftFailure = (error: unknown): never => {
  throw explainGiftFailure(error) ?? error;
};
