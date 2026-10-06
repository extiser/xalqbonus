import { countedPlainText, plainText } from '#server/bot/texts';
import { listUnfinishedSurveyResponses } from '#server/repositories/surveyResponses';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { isSurveyClosed } from '#server/services/surveys/closed';
import {
  surveyEndsOnWord,
  surveyPointsLabel,
  withStrongPoints,
} from '#server/services/surveys/memberSurveyScreen';
import type { MemberSurveyBanner } from '#shared/types/memberSurvey';

/**
 * Плашка опроса на главной под баллами (issue #323) — одна из двух, на языке водителя:
 *
 * - «Опрос не закончен» — есть первый ответ, нет завершения, опрос не закрыт. Заголовок —
 *   по вопросам без ответа;
 * - «Пройдите опрос» — опрос открыт, ответов нет, опрос не закрыт. И после отказа тоже: «Закрыть»
 *   могли нажать случайно.
 *
 * Кто опрос не открывал, плашки не видит: у него в чате сообщение рассылки с кнопкой. Открытых
 * опросов несколько — одна плашка: первый незакрытый в порядке `listUnfinishedSurveyResponses`.
 *
 * «Не закрыт» — `isSurveyClosed`, то же правило, что у экрана опроса: ни срок не прошёл, ни опрос
 * не завершён досрочно (issue #348).
 */
export const readMemberSurveyBanner = async (
  driver: LinkedDriver,
  now: Date,
): Promise<MemberSurveyBanner | null> => {
  const row = (await listUnfinishedSurveyResponses(driver.personId, driver.isDemo)).find(
    (candidate) => !isSurveyClosed(candidate, now),
  );

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
