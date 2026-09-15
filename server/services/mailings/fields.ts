import type { MailingFieldsInput, MailingRow } from '#server/repositories/mailings';
import {
  MailingFieldTooLongError,
  MailingNotLaunchableError,
} from '#server/services/mailings/errors';
import { MAILING_TEXT_MAX_LENGTH, mailingLaunchProblems } from '#shared/mailing';
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
  recall: {
    startedAt: row.recallStartedAt?.toISOString() ?? null,
    finishedAt: row.recallFinishedAt?.toISOString() ?? null,
    recalled: row.recalled,
    deadlineAt: row.recallDeadlineAt?.toISOString() ?? null,
  },
});

export type MailingFields = MailingFieldsInput;

/** Тело заведения и правки так, как его видит разбор: всё `unknown`, пришло от клиента. */
export type MailingRequestFields = {
  title?: unknown;
  textRu?: unknown;
  textUz?: unknown;
};

/** Строка поля, обрезанная по краям. Пустое и не строка — `null`: пусто пишется одним способом. */
const readText = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';

  return text === '' ? null : text;
};

/**
 * Поля черновика из тела запроса. Обязательных нет: черновик заводится первым набранным
 * символом или выбранным файлом, и заголовка у него в этот момент может не быть
 * (issue #148). Чего не хватает для запуска, решает запуск.
 */
export const readMailingFields = (body: MailingRequestFields | null | undefined): MailingFields => ({
  title: readText(body?.title),
  textRu: readText(body?.textRu),
  textUz: readText(body?.textUz),
});

/**
 * Жёсткий предел каждого текста при сохранении — физический потолок `sendMessage`.
 *
 * От фото он не зависит и склейку не меряет: это свойство поля, и в форме он стоит
 * `maxlength`. Длиннее Telegram не примет ни с фото, ни без, и такой текст в черновике —
 * не рабочее состояние, а ошибка ввода.
 */
export const assertMailingFieldLengths = (texts: {
  textRu: string | null;
  textUz: string | null;
}): void => {
  if (texts.textRu !== null && texts.textRu.length > MAILING_TEXT_MAX_LENGTH) {
    throw new MailingFieldTooLongError('textRu', MAILING_TEXT_MAX_LENGTH);
  }

  if (texts.textUz !== null && texts.textUz.length > MAILING_TEXT_MAX_LENGTH) {
    throw new MailingFieldTooLongError('textUz', MAILING_TEXT_MAX_LENGTH);
  }
};

/**
 * Можно ли запускать черновик. Зовётся только запуском.
 *
 * Все причины сразу — заголовок, текст хотя бы на одном языке и длина по потолку Telegram — тем же списком,
 * что экран показывает у закрытой кнопки (`shared/mailing.ts`). Потолок склейки зависит от фото.
 *
 * Сохранение и загрузка фото эту проверку не зовут: черновик — рабочее состояние, и человек
 * вправе сначала положить картинку, а потом подрезать текст. Отказ фото из-за длины текста —
 * отказ не тому действию (issue #136, прогон 15-09-2026).
 */
export const assertMailingLaunchable = (row: MailingRow): void => {
  const problems = mailingLaunchProblems(row, row.photoPath !== null);

  if (problems.length > 0) {
    throw new MailingNotLaunchableError(row.id, problems);
  }
};
