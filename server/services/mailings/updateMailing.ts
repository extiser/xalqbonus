import { findMailing, updateDraftMailing } from '#server/repositories/mailings';
import { checkMailingSegment } from '#server/services/mailings/checkMailingSegment';
import { checkMailingSurvey } from '#server/services/mailings/checkMailingSurvey';
import {
  MailingStatusMismatchError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import { assertMailingFieldLengths, type MailingFields } from '#server/services/mailings/fields';
import { readMailing } from '#server/services/mailings/readMailing';
import type { Mailing } from '#shared/types/mailing';

/**
 * Правка черновика. Запущенная рассылка не правится ничем: снимок уже снят, часть людей
 * сообщение уже получила, и правка текста разделила бы одну рассылку на две.
 *
 * Сегмент и опрос правятся так же, только у черновика (issue #321). Проверяются, когда их
 * выбирают заново: архивный сегмент и опрос, срок которого прошёл после выбора, черновик
 * сохраняют — их не пустит запуск.
 */
export const updateMailing = async (mailingId: string, fields: MailingFields): Promise<Mailing> => {
  const current = await findMailing(mailingId);

  if (!current) {
    throw new UnknownMailingError(mailingId);
  }

  // Только жёсткий предел поля: черновик с перебором склейки сохраняется, запуск его не пустит.
  assertMailingFieldLengths(fields);
  await checkMailingSegment(fields.segmentId, current.segmentId, current.isDemo);
  await checkMailingSurvey(fields.surveyId, current.surveyId, current.isDemo);

  // Условие «ещё черновик» стоит в самом `UPDATE`: между чтением выше и записью рассылку
  // мог запустить второй сотрудник.
  if (!(await updateDraftMailing(mailingId, fields))) {
    const after = await findMailing(mailingId);

    if (!after) {
      throw new UnknownMailingError(mailingId);
    }

    throw new MailingStatusMismatchError(mailingId, after.status, 'draft');
  }

  return readMailing(mailingId);
};
