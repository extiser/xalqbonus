import type { MailingFieldsInput, MailingRow } from '#server/repositories/mailings';
import {
  InvalidActiveWithinDaysError,
  MailingTextTooLongError,
} from '#server/services/mailings/errors';
import {
  buildMailingMessage,
  MAILING_ACTIVE_DAYS_MAX,
  mailingMessageLimit,
} from '#shared/mailing';
import type { Mailing } from '#shared/types/mailing';

/**
 * Перевод между строкой базы, контрактом ручки и полями формы. Операцией не является
 * и поэтому лежит отдельным файлом: нужен он всем ручкам рассылок сразу.
 */

export const toMailing = (row: MailingRow): Mailing => ({
  mailingId: row.id,
  title: row.title,
  textRu: row.textRu,
  textUz: row.textUz,
  photoPath: row.photoPath,
  activeWithinDays: row.activeWithinDays,
  status: row.status,
  createdByName: row.createdByName,
  createdAt: row.createdAt.toISOString(),
  startedAt: row.startedAt?.toISOString() ?? null,
  finishedAt: row.finishedAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
  counters: {
    total: row.total,
    pending: row.pending,
    sent: row.sent,
    skippedDisabled: row.skippedDisabled,
    invalidChat: row.invalidChat,
    failed: row.failed,
  },
});

export type MailingFields = MailingFieldsInput;

/** Тело заведения и правки так, как его видит разбор: всё `unknown`, пришло от клиента. */
export type MailingRequestFields = {
  title?: unknown;
  textRu?: unknown;
  textUz?: unknown;
  activeWithinDays?: unknown;
};

/**
 * Фильтр активности из тела или строки запроса. Пусто — фильтра нет, все участники.
 *
 * Непустое, но негодное — отказ, а не «фильтра нет»: молча разосланное всему парку вместо
 * «ездившим за неделю» не отзывается.
 */
export const readActiveWithinDays = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAILING_ACTIVE_DAYS_MAX) {
    throw new InvalidActiveWithinDaysError(value);
  }

  return parsed;
};

/**
 * Поля рассылки из тела запроса. `null` — нет заголовка или русского текста: это разбор
 * запроса, а не отказ человеку (docs/frontend.md → «Обязательное поле — свойство поля»).
 */
export const readMailingFields = (
  body: MailingRequestFields | null | undefined,
): MailingFields | null => {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const textRu = typeof body?.textRu === 'string' ? body.textRu.trim() : '';
  const textUz = typeof body?.textUz === 'string' ? body.textUz.trim() : '';

  if (title === '' || textRu === '') {
    return null;
  }

  return {
    title,
    textRu,
    textUz: textUz === '' ? null : textUz,
    activeWithinDays: readActiveWithinDays(body?.activeWithinDays),
  };
};

/**
 * Влезает ли сообщение в то, что примет Telegram.
 *
 * Меряется склейка — ровно то, что уйдёт: оба текста с заголовками языков и пустой строкой
 * между блоками (`shared/mailing.ts`). Порознь 900 + 900 проходят, а отказывают на первом же
 * адресате. Потолок зависит от фото: подпись к нему вчетверо короче сообщения.
 *
 * Проверяется и при сохранении, и при загрузке фото, и при запуске — рассылка, упавшая
 * на лимите на первом адресате, отказала бы всем четырём тысячам разом.
 */
export const assertMailingTexts = (
  texts: { textRu: string; textUz: string | null },
  withPhoto: boolean,
): void => {
  const limit = mailingMessageLimit(withPhoto);
  const { length } = buildMailingMessage(texts.textRu, texts.textUz).text;

  if (length > limit) {
    throw new MailingTextTooLongError(length, limit, withPhoto);
  }
};
