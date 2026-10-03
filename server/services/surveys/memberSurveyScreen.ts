import { countedPlainText, formatPoints, plainText } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import { findTransferAmountByIdempotencyKey } from '#server/repositories/points';
import type { SurveyAnswerRow, SurveyResponseRow } from '#server/repositories/surveyResponses';
import {
  findSurvey,
  type SurveyOptionRow,
  type SurveyQuestionRow,
  type SurveyRow,
} from '#server/repositories/surveys';
import type { Prisma } from '#server/generated/prisma/client';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { buildSurveyIdempotencyKey } from '#server/services/points/idempotencyKey';
import { isSurveyClosed } from '#server/services/surveys/closed';
import { calendarDayMoment, formatDayMonthWord } from '#server/utils/parkTime';
import type {
  MemberSurvey,
  MemberSurveyQuestion,
  MemberSurveyStage,
  MemberSurveyTextPart,
  MemberSurveyView,
} from '#shared/types/memberSurvey';
import type { SurveyQuestionType } from '#shared/types/survey';

/**
 * Опрос глазами водителя (issue #323): кому он доступен, на каком он экране и как выглядит
 * на обоих языках. Операцией не является — нужен чтению, отказу и сохранению ответа сразу.
 */

/** Метка выделенной части в шаблоне строки: «{points} на баланс сразу после ответов». */
const POINTS_MARK = '{points}';

/**
 * Опрос, который этот человек может открыть. Пусто — опроса нет или он недоступен, и Mini App
 * показывает главную, как без параметра.
 *
 * Черновик недоступен: он ещё правится, и ответы до и после правки несравнимы (решение Руслана
 * 03-10-2026). Демо-опрос — только демо-водителю, как демо-рассылка; живой видят все. Получал ли
 * человек рассылку с опросом, не проверяется: пересланная кнопка ничего не ломает, баллы
 * за опрос всё равно один раз.
 */
export const findAvailableSurvey = async (
  surveyId: string,
  driver: LinkedDriver,
  client?: Prisma.TransactionClient,
): Promise<SurveyRow | null> => {
  const survey = await findSurvey(surveyId, client);

  if (!survey || survey.frozenAt === null || (survey.isDemo && !driver.isDemo)) {
    return null;
  }

  return survey;
};

/**
 * Экран опроса по прохождению. Пройденный показывает финал и после срока; закрытый по сроку —
 * «опрос закрыт»; начатый — вопросы с первого без ответа; остальное, отказ тоже, — открытие.
 */
export const surveyStage = (
  survey: SurveyRow,
  response: SurveyResponseRow | null,
  moment: Date,
): MemberSurveyStage => {
  if (response?.completedAt) {
    return 'finish';
  }

  if (isSurveyClosed(survey.endsOn, moment)) {
    return 'closed';
  }

  return response?.startedAt ? 'questions' : 'intro';
};

/**
 * Сколько баллов показать на финале пройденного опроса: запись журнала по ключу опроса
 * и человека, а без неё — сумма опроса (опрос без награды записи не оставляет).
 *
 * Читается, а не начисляется: пустой перевод взял бы `FOR UPDATE` на общий счёт `emission`
 * (`awardWelcomeBonus.ts`), и каждое открытие пройденного опроса вставало бы в очередь
 * за начислениями.
 */
export const readSurveyFinishPoints = async (
  survey: SurveyRow,
  personId: string,
  client?: Prisma.TransactionClient,
): Promise<number> => {
  const amount = await findTransferAmountByIdempotencyKey(
    buildSurveyIdempotencyKey(survey.id, personId),
    client,
  );

  return amount === null ? survey.points : Number(amount);
};

/** Последний день опроса словом на языке: «15 октября», «15-oktabr». */
export const surveyEndsOnWord = (endsOn: string, language: Language): string =>
  formatDayMonthWord(calendarDayMoment(endsOn), language);

/** «+50 баллов». */
export const surveyPointsLabel = (points: number, language: Language): string =>
  countedPlainText('survey_points', language, points);

/**
 * Строка с выделенными баллами кусками: место баллов в строке задаёт язык, и склеивать
 * их на экране по-русски нельзя.
 */
export const withStrongPoints = (template: string, points: string): MemberSurveyTextPart[] =>
  template
    .split(POINTS_MARK)
    .flatMap((text, index) => [
      ...(index > 0 ? [{ text: points, strong: true }] : []),
      ...(text === '' ? [] : [{ text, strong: false }]),
    ]);

const HINT_KEYS = {
  single: 'survey_hint_single',
  multiple: 'survey_hint_multiple',
  text: 'survey_hint_text',
  scale: 'survey_hint_scale',
} as const satisfies Record<SurveyQuestionType, string>;

/**
 * Тексты опроса из базы. У замороженного пустых нет (`surveys_frozen_complete_check`, триггер
 * `surveys_frozen_questions`), а черновик сюда не доходит: пустая строка — страховка типа.
 */
const localized = (ru: string | null, uz: string | null, language: Language): string =>
  (language === 'ru' ? ru : uz) ?? '';

type SurveyViewInput = {
  survey: SurveyRow;
  questions: SurveyQuestionRow[];
  options: SurveyOptionRow[];
  /** Сумма на финале: начисленная — у пройденного, сумма опроса — у остальных. */
  finishPoints: number;
};

const buildView = (input: SurveyViewInput, language: Language): MemberSurveyView => {
  const { survey, questions, options } = input;
  const total = questions.length;
  const endsOn = survey.endsOn === null ? '' : surveyEndsOnWord(survey.endsOn, language);

  const terms: MemberSurveyView['intro']['terms'] = [
    {
      kind: 'questions',
      parts: [{ text: countedPlainText('survey_term_questions', language, total), strong: false }],
    },
    ...(survey.points > 0
      ? [
          {
            kind: 'points' as const,
            parts: withStrongPoints(
              plainText('survey_term_points', language),
              surveyPointsLabel(survey.points, language),
            ),
          },
        ]
      : []),
    { kind: 'until', parts: [{ text: plainText('survey_term_until', language, { date: endsOn }), strong: false }] },
    { kind: 'saved', parts: [{ text: plainText('survey_term_saved', language), strong: false }] },
  ];

  const memberQuestions: MemberSurveyQuestion[] = questions.map((question, index) => ({
    questionId: question.id,
    type: question.type,
    required: question.required,
    allowOwnAnswer: question.allowOwnAnswer,
    number: plainText('survey_question_number', language, {
      number: String(index + 1),
      total: String(total),
    }),
    text: localized(question.textRu, question.textUz, language),
    hint: plainText(HINT_KEYS[question.type], language),
    options: options
      .filter((option) => option.questionId === question.id)
      .map((option) => ({
        optionId: option.id,
        text: localized(option.textRu, option.textUz, language),
        exclusive: option.exclusive,
      })),
  }));

  return {
    intro: {
      title: plainText('survey_title', language),
      lead: localized(survey.introRu, survey.introUz, language),
      terms,
      start: plainText('survey_start', language),
      decline: localized(survey.declineButtonRu, survey.declineButtonUz, language),
    },
    questions: memberQuestions,
    controls: {
      next: plainText('survey_next', language),
      skip: plainText('survey_skip', language),
      back: plainText('button_back', language),
      ownAnswer: plainText('survey_own_answer', language),
      placeholder: plainText('survey_answer_placeholder', language),
      scaleLow: plainText('survey_scale_low', language),
      scaleHigh: plainText('survey_scale_high', language),
      saveFailed: plainText('request_failed', language),
    },
    finish: {
      title: plainText('survey_finish_title', language),
      lead: localized(survey.finishRu, survey.finishUz, language),
      gain:
        input.finishPoints > 0
          ? {
              amount: `+${formatPoints(BigInt(input.finishPoints))}`,
              caption: countedPlainText('survey_gain_caption', language, input.finishPoints),
            }
          : null,
      app: localized(survey.appButtonRu, survey.appButtonUz, language),
    },
    closed: {
      title: plainText('survey_closed_title', language),
      lead: plainText('survey_closed_text', language, { date: endsOn }),
      button: plainText('survey_closed_button', language),
    },
  };
};

export type PresentMemberSurveyInput = SurveyViewInput & {
  stage: MemberSurveyStage;
  answers: SurveyAnswerRow[];
  language: Language;
};

/** Опрос для экрана: этап, сохранённые ответы и вид на обоих языках. */
export const presentMemberSurvey = (input: PresentMemberSurveyInput): MemberSurvey => ({
  surveyId: input.survey.id,
  stage: input.stage,
  language: input.language,
  answers: input.answers.map((answer) => ({
    questionId: answer.questionId,
    optionIds: answer.optionIds,
    ownText: answer.ownText,
    textValue: answer.textValue,
    scaleValue: answer.scaleValue,
  })),
  views: {
    ru: buildView(input, 'ru'),
    uz: buildView(input, 'uz'),
  },
});
