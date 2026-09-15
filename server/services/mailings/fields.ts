import type { MailingFieldsInput, MailingRow } from '#server/repositories/mailings';
import {
  MailingFieldTooLongError,
  MailingTextTooLongError,
} from '#server/services/mailings/errors';
import {
  buildMailingMessage,
  MAILING_TEXT_MAX_LENGTH,
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

  return { title, textRu, textUz: textUz === '' ? null : textUz };
};

/**
 * Жёсткий предел каждого текста при сохранении — физический потолок `sendMessage`.
 *
 * От фото он не зависит и склейку не меряет: это свойство поля, и в форме он стоит
 * `maxlength`. Длиннее Telegram не примет ни с фото, ни без, и такой текст в черновике —
 * не рабочее состояние, а ошибка ввода.
 */
export const assertMailingFieldLengths = (texts: { textRu: string; textUz: string | null }): void => {
  if (texts.textRu.length > MAILING_TEXT_MAX_LENGTH) {
    throw new MailingFieldTooLongError('textRu', MAILING_TEXT_MAX_LENGTH);
  }

  if (texts.textUz !== null && texts.textUz.length > MAILING_TEXT_MAX_LENGTH) {
    throw new MailingFieldTooLongError('textUz', MAILING_TEXT_MAX_LENGTH);
  }
};

/**
 * Влезает ли сообщение в то, что примет Telegram. Зовётся только запуском.
 *
 * Меряется склейка — ровно то, что уйдёт: оба текста с заголовками языков и пустой строкой
 * между блоками (`shared/mailing.ts`). Потолок зависит от фото.
 *
 * Сохранение и загрузка фото эту проверку не зовут: черновик — рабочее состояние, и человек
 * вправе сначала положить картинку, а потом подрезать текст. Отказ фото из-за длины текста —
 * отказ не тому действию (issue #136, прогон 15-09-2026).
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
