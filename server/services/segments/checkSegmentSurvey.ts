import { findSurvey } from '#server/repositories/surveys';
import {
  SegmentSurveyDemoMismatchError,
  SegmentSurveyNotFrozenError,
  SegmentSurveyUnknownError,
} from '#server/services/segments/errors';
import type { SegmentConditions } from '#shared/types/segment';

/**
 * Годится ли опрос условию сегмента (issue #324):
 *
 * - признак демо совпадает — как у рассылки и акции
 * - опрос заморожен: незамороженный ни разу не уходил рассылкой, и состав по нему был бы пуст
 *   по построению — пустота, которая выглядит как «все прошли»
 *
 * Закрытый по сроку годится: по нему бывает нужна рассылка-благодарность или разбор.
 *
 * Проверяется при каждом сохранении и предпросмотре несохранённого, а не только при смене
 * опроса: заморозка и признак демо у опроса не меняются, и повторная проверка ничего
 * не ломает, а предпросмотр не примет того, что отвергнет сохранение.
 */
export const checkSegmentSurvey = async (
  conditions: SegmentConditions,
  segmentIsDemo: boolean,
): Promise<void> => {
  const { surveyId } = conditions;

  if (surveyId === null) {
    return;
  }

  const survey = await findSurvey(surveyId);

  if (!survey) {
    throw new SegmentSurveyUnknownError(surveyId);
  }

  if (survey.isDemo !== segmentIsDemo) {
    throw new SegmentSurveyDemoMismatchError(surveyId, segmentIsDemo);
  }

  if (survey.frozenAt === null) {
    throw new SegmentSurveyNotFrozenError(surveyId);
  }
};
