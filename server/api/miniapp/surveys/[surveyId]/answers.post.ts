import { SurveyAnswerInvalidError } from '#server/services/surveys/errors';
import { saveMemberSurveyAnswer } from '#server/services/surveys/saveMemberSurveyAnswer';
import { requireMember } from '#server/utils/miniAppMember';
import { readUuid, requireUuidParam } from '#server/utils/query';
import type {
  MiniAppSurveyAnswerRequestBody,
  MiniAppSurveyResponse,
} from '#shared/types/memberSurvey';

/**
 * Ответ на вопрос опроса (issue #323) — при переходе к следующему вопросу. Ответ на последний
 * проходит опрос и начисляет баллы; ответ выбирает экран: следующий вопрос, финал или «опрос
 * закрыт». Логики здесь нет — её держит `saveMemberSurveyAnswer`.
 *
 * Чей ответ — решает подпись, а не тело: человека в запросе нет.
 */

const badRequest = (message: string) =>
  createError({ statusCode: 400, statusMessage: 'Bad Request', message });

/** Предел от испорченного запроса: вариантов у вопроса единицы. */
const OPTION_IDS_LIMIT = 50;

const readNullableString = (value: unknown): string | null | undefined =>
  value === null || typeof value === 'string' ? value : undefined;

export default defineEventHandler(async (event): Promise<MiniAppSurveyResponse> => {
  const driver = await requireMember(event);
  const surveyId = requireUuidParam(event, 'surveyId');
  const body = await readBody<Partial<MiniAppSurveyAnswerRequestBody> | null>(event);

  const questionId = readUuid(body?.questionId);
  const optionIds = Array.isArray(body?.optionIds) ? body.optionIds.map((value) => readUuid(value)) : null;
  const ownText = readNullableString(body?.ownText);
  const textValue = readNullableString(body?.textValue);
  const scaleValue = body?.scaleValue;

  if (
    !questionId ||
    !optionIds ||
    optionIds.length > OPTION_IDS_LIMIT ||
    optionIds.some((optionId) => optionId === null) ||
    ownText === undefined ||
    textValue === undefined ||
    !(scaleValue === null || typeof scaleValue === 'number')
  ) {
    throw badRequest('нужны questionId, optionIds, ownText, textValue и scaleValue');
  }

  try {
    return await saveMemberSurveyAnswer(
      driver,
      surveyId,
      {
        questionId,
        optionIds: optionIds.filter((optionId): optionId is string => optionId !== null),
        ownText,
        textValue,
        scaleValue,
      },
      new Date(),
    );
  } catch (error) {
    // Экран такого не шлёт: вариант чужого вопроса, пустой обязательный, исключающий с соседями.
    if (error instanceof SurveyAnswerInvalidError) {
      throw badRequest(error.message);
    }

    throw error;
  }
});
