import { countedPlainText, plainText } from '#server/bot/texts';
import { findOpenSurveyResponse } from '#server/repositories/surveyResponses';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import {
  surveyEndsOnWord,
  surveyPointsLabel,
  withStrongPoints,
} from '#server/services/surveys/memberSurveyScreen';
import { formatDayKey } from '#server/utils/parkTime';
import type { MemberSurveyBanner } from '#shared/types/memberSurvey';

/**
 * Плашка опроса на главной под баллами (issue #323) — одна из двух, на языке водителя:
 *
 * - «Опрос не закончен» — есть первый ответ, нет завершения, срок не прошёл. Заголовок —
 *   по вопросам без ответа;
 * - «Пройдите опрос» — опрос открыт, ответов нет, срок не прошёл. И после отказа тоже: «Закрыть»
 *   могли нажать случайно (решение Руслана 03-10-2026).
 *
 * Кто опрос не открывал, плашки не видит: у него в чате сообщение рассылки с кнопкой. Открытых
 * опросов несколько — одна плашка, выбор в `findOpenSurveyResponse`.
 *
 * «Срок не прошёл» — по календарному дню парка, как `isSurveyClosed`: опрос не связан с поездками.
 */
export const readMemberSurveyBanner = async (
  driver: LinkedDriver,
  now: Date,
): Promise<MemberSurveyBanner | null> => {
  const row = await findOpenSurveyResponse(driver.personId, formatDayKey(now), driver.isDemo);

  if (!row) {
    return null;
  }

  const { language } = driver;
  const date = surveyEndsOnWord(row.endsOn, language);
  const points = surveyPointsLabel(row.points, language);

  if (row.started) {
    return {
      surveyId: row.surveyId,
      kicker: plainText('survey_banner_progress_kicker', language),
      title: countedPlainText(
        'survey_banner_progress_title',
        language,
        Math.max(row.questionCount - row.answeredCount, 0),
      ),
      when:
        row.points > 0
          ? withStrongPoints(plainText('survey_banner_progress_when', language, { date }), points)
          : [{ text: plainText('survey_banner_progress_saved', language, { date }), strong: false }],
    };
  }

  const when = countedPlainText(
    row.points > 0 ? 'survey_banner_start_when' : 'survey_banner_start_when_free',
    language,
    row.questionCount,
  ).replaceAll('{date}', date);

  return {
    surveyId: row.surveyId,
    kicker: plainText('survey_banner_start_kicker', language),
    title: plainText('survey_banner_start_title', language),
    when: withStrongPoints(when, points),
  };
};
