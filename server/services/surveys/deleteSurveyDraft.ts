import { consola } from 'consola';
import { deleteDraftSurvey, findSurvey } from '#server/repositories/surveys';
import {
  SurveyAttachedError,
  SurveyFrozenError,
  UnknownSurveyError,
} from '#server/services/surveys/errors';

/**
 * Удаление черновика опроса — вместе с вопросами и вариантами, как у рассылки.
 *
 * Физическое: ответы появляются только у ушедшего опроса, а ушедший заморожен и не удаляется —
 * по нему есть рассылки и ответы. Черновик, прикреплённый к черновику рассылки, тоже
 * не удаляется (issue #321): откреплять его молча значило бы менять чужой черновик, и отказ
 * говорит, где открепить.
 *
 * Брошенные черновики сами не чистятся — запись, исчезнувшая по возрасту, выглядит как
 * потеря работы.
 */
const log = consola.withTag('surveys:delete');

export const deleteSurveyDraft = async (surveyId: string): Promise<void> => {
  if (!(await deleteDraftSurvey(surveyId))) {
    const current = await findSurvey(surveyId);

    if (!current) {
      throw new UnknownSurveyError(surveyId);
    }

    // Не заморожен, а `DELETE` не прошёл — значит, держит прикрепление к рассылке.
    if (current.frozenAt === null) {
      throw new SurveyAttachedError(surveyId);
    }

    throw new SurveyFrozenError(surveyId, 'delete');
  }

  log.info('черновик опроса удалён', { surveyId });
};
