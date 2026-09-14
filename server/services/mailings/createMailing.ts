import { consola } from 'consola';
import { insertDraftMailing } from '#server/repositories/mailings';
import { assertMailingTexts, type MailingFields } from '#server/services/mailings/fields';
import { readMailing } from '#server/services/mailings/readMailing';
import type { Mailing } from '#shared/types/mailing';

/**
 * Заведение черновика.
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
  assertMailingTexts(fields, false);

  const mailingId = await insertDraftMailing({ ...fields, photoPath: null, createdById });

  log.info('черновик рассылки заведён', { mailingId, createdById });

  return readMailing(mailingId);
};
