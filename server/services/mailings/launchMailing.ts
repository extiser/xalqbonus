import { consola } from 'consola';
import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import { enqueueMailingRecipients } from '#server/queues/mailing';
import {
  findMailing,
  finishMailingIfDone,
  insertMailingRecipients,
  listPendingRecipientIds,
  markMailingRunning,
  type MailingAudienceSegment,
} from '#server/repositories/mailings';
import { findSegment } from '#server/repositories/segments';
import {
  findSurvey,
  freezeSurvey,
  listSurveyOptions,
  listSurveyQuestions,
  lockSurvey,
} from '#server/repositories/surveys';
import { assertMailingSegment } from '#server/services/mailings/checkMailingSegment';
import { assertMailingSurvey } from '#server/services/mailings/checkMailingSurvey';
import {
  MailingAudienceEmptyError,
  MailingStatusMismatchError,
  MailingSurveyIncompleteError,
  MailingSurveyUnknownError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import { assertMailingLaunchable } from '#server/services/mailings/fields';
import { readMailing } from '#server/services/mailings/readMailing';
import { toSegmentBasis } from '#server/services/segments/fields';
import { toSurvey } from '#server/services/surveys/fields';
import { surveyFreezeProblems } from '#shared/survey';
import type { Mailing } from '#shared/types/mailing';

/**
 * Запуск рассылки: снимок адресатов и задания в очередь.
 *
 * Смена статуса и снимок — одна транзакция. Рассылка в статусе «идёт» без снимка означала бы
 * рассылку, которой некому уходить и которую нельзя ни запустить заново, ни честно посчитать.
 * Пустой снимок откатывает и статус: рассылать некому, и это не отправка.
 *
 * Заголовок, текст хотя бы на одном языке и предел длины проверяются здесь и только здесь: это
 * условия запуска, а не сохранения — черновик без них сохраняется, а уходить не должен
 * (issue #136, #148). Та же полнота стоит проверкой в базе: не черновик без текста
 * не записывается.
 *
 * Сегмент и опрос (issue #321) проверяются внутри той же транзакции, по строке, перечитанной
 * после смены статуса: с этого момента правка черновика уже не пройдёт, и снимок снимается
 * ровно с тем сегментом, что проверен. Сегмент — как у акции: есть, того же мира, не в архиве.
 * Опрос — того же мира, не закрыт по сроку и полон; запуск ставит ему `frozen_at` тут же.
 * Рассылка, ушедшая с незамороженным опросом, — ровно то, от чего заморозка защищает.
 *
 * Задания ставятся после фиксации, а не внутри: Redis в транзакцию базы не входит, и задание,
 * поставленное до фиксации, воркер мог бы взять раньше, чем появится строка снимка.
 * Упавшая постановка оставляет адресатов `pending` — и повтор запуска её доделывает:
 * для идущей рассылки он ставит задания ждущим снова, а `jobId` из пары
 * «рассылка + человек» и условие «ещё `pending`» при записи исхода не дают отправить дважды.
 */
const log = consola.withTag('mailings:launch');

/**
 * Проверка и заморозка опроса рассылки — внутри транзакции запуска.
 *
 * Под блокировкой строки опроса, той же, что берёт его правка (`updateSurvey.ts`): полнота,
 * проверенная здесь, не разойдётся с содержимым, которое правка записала бы между проверкой
 * и заморозкой. Полнота — теми же причинами, что видны на экране опроса (`shared/survey.ts`).
 *
 * Опрос, замороженный прежней рассылкой, повторно не замораживается и запуску не мешает:
 * условие «ещё не заморожен» стоит в самом `UPDATE`.
 */
const freezeMailingSurvey = async (
  surveyId: string,
  mailingIsDemo: boolean,
  transaction: Prisma.TransactionClient,
): Promise<void> => {
  if (!(await lockSurvey(surveyId, transaction))) {
    throw new MailingSurveyUnknownError(surveyId);
  }

  const moment = new Date();
  const row = assertMailingSurvey(
    await findSurvey(surveyId, transaction),
    surveyId,
    mailingIsDemo,
    moment,
  );

  // Друг за другом, а не разом: запросы интерактивной транзакции идут по одному соединению.
  const questions = await listSurveyQuestions(surveyId, transaction);
  const options = await listSurveyOptions(surveyId, transaction);
  const problems = surveyFreezeProblems(toSurvey(row, questions, options, moment));

  if (problems.length > 0) {
    throw new MailingSurveyIncompleteError(surveyId, problems);
  }

  if (await freezeSurvey(surveyId, transaction)) {
    log.info('опрос заморожен запуском рассылки', { surveyId });
  }
};

export const launchMailing = async (mailingId: string): Promise<Mailing> => {
  const current = await findMailing(mailingId);

  if (!current) {
    throw new UnknownMailingError(mailingId);
  }

  if (current.status === 'draft') {
    // До транзакции: черновик без текста отбила бы проверкой база на смене статуса, и отказ
    // ушёл бы пятисоткой, а не списком причин.
    assertMailingLaunchable(current);

    const snapshot = await db.$transaction(async (transaction) => {
      if (!(await markMailingRunning(mailingId, transaction))) {
        return null;
      }

      // Строка рассылки уже под блокировкой `UPDATE` выше: правка, пришедшая между первым
      // чтением и запуском, могла сменить тексты, сегмент или опрос — судим по этой.
      const row = await findMailing(mailingId, transaction);

      if (!row) {
        throw new UnknownMailingError(mailingId);
      }

      assertMailingLaunchable(row);

      let segment: MailingAudienceSegment | null = null;

      if (row.segmentId !== null) {
        const segmentRow = assertMailingSegment(
          await findSegment(row.segmentId, transaction),
          row.segmentId,
          row.isDemo,
        );

        segment = toSegmentBasis(segmentRow);
      }

      if (row.surveyId !== null) {
        await freezeMailingSurvey(row.surveyId, row.isDemo, transaction);
      }

      const recipients = await insertMailingRecipients(mailingId, row.isDemo, segment, transaction);

      if (recipients === 0) {
        throw new MailingAudienceEmptyError(mailingId, segment !== null);
      }

      return recipients;
    });

    // Запустили между чтением и транзакцией — вторым нажатием или вторым сотрудником.
    // Снимок уже снят тем запуском; этот доставит задания так же, как повтор ниже.
    if (snapshot !== null) {
      log.info('рассылка запущена, снимок снят', { mailingId, recipients: snapshot });
    }
  } else if (current.status !== 'running') {
    throw new MailingStatusMismatchError(mailingId, current.status, 'draft');
  }

  const pending = await listPendingRecipientIds(mailingId);

  await enqueueMailingRecipients(mailingId, pending);

  // Снимок из одних выключивших уведомления: ждать нечего, рассылка кончилась сразу.
  if (pending.length === 0) {
    await finishMailingIfDone(mailingId);
  }

  log.info('задания рассылки поставлены', { mailingId, jobs: pending.length });

  return readMailing(mailingId);
};
