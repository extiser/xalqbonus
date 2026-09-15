import { consola } from 'consola';
import { insertDraftMailing } from '#server/repositories/mailings';
import { assertMailingFieldLengths, type MailingFields } from '#server/services/mailings/fields';
import { readMailing } from '#server/services/mailings/readMailing';
import type { Mailing } from '#shared/types/mailing';

/**
 * Заведение черновика.
 *
 * Заводит его форма первым набранным символом или выбранным файлом (issue #148), поэтому
 * поля могут быть пустыми все: заголовок и русский текст — условия запуска, а не заведения.
 *
 * Без фото: фото — файл и приезжает своим запросом к уже заведённой рассылке, как у товара.
 * Автор — ссылка на учётку, а не строка (docs/decisions.md → «След сотрудника в журналах —
 * ссылка, а не строка»).
 */
const log = consola.withTag('mailings:create');

export const createMailing = async (
  fields: MailingFields,
  createdById: string,
): Promise<Mailing> => {
  // Только жёсткий предел поля: склейка по потолку Telegram — условие запуска, а не сохранения.
  assertMailingFieldLengths(fields);

  const mailingId = await insertDraftMailing({ ...fields, photoPath: null, createdById });

  log.info('черновик рассылки заведён', { mailingId, createdById });

  return readMailing(mailingId);
};
