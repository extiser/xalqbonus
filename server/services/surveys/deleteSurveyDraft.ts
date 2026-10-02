import { consola } from 'consola';
import { deleteDraftSurvey, findSurvey } from '#server/repositories/surveys';
import { SurveyFrozenError, UnknownSurveyError } from '#server/services/surveys/errors';

/**
 * Удаление черновика опроса — вместе с вопросами и вариантами, как у рассылки.
 *
 * Физическое: на черновик никто не ссылается — ответы и прикрепление к рассылке появляются
 * только у ушедшего опроса, а ушедший заморожен. Замороженный не удаляется: по нему есть
 * рассылки и ответы.
 *
 * Брошенные черновики сами не чистятся — запись, исчезнувшая по возрасту, выглядит как
 * потеря работы.
 */
const log = consola.withTag('surveys:delete');

export const deleteSurveyDraft = async (surveyId: string): Promise<void> => {
  if (!(await deleteDraftSurvey(surveyId))) {
    if (!(await findSurvey(surveyId))) {
      throw new UnknownSurveyError(surveyId);
    }

    throw new SurveyFrozenError(surveyId, 'delete');
  }

  log.info('черновик опроса удалён', { surveyId });
};
