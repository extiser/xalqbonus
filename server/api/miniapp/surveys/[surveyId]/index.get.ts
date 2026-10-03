import { readMemberSurvey } from '#server/services/surveys/readMemberSurvey';
import { requireMember } from '#server/utils/miniAppMember';
import { requireUuidParam } from '#server/utils/query';
import type { MiniAppSurveyResponse } from '#shared/types/memberSurvey';

// Опрос, открытый по кнопке рассылки `?survey=<id>` или с плашки на главной (issue #323).
// Первое открытие ставит `opened_at`. Нет опроса или он недоступен — `{ survey: null }`,
// а не отказ: Mini App показывает главную, как без параметра.
export default defineEventHandler(async (event): Promise<MiniAppSurveyResponse> => {
  const driver = await requireMember(event);
  const surveyId = requireUuidParam(event, 'surveyId');

  return readMemberSurvey(driver, surveyId, new Date());
});
