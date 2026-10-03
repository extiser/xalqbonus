import { db } from '#server/db';

/**
 * Опросы для тестов начисления баллов за опрос (issue #322) и его завершения (issue #323).
 *
 * Уборка — по опросам, заведённым тестом, и до уборки сотрудников: автор опроса стоит
 * внешним ключом `RESTRICT`, и сотрудник, заведший опрос, иначе не удалился бы.
 */

const createdSurveyIds = new Set<string>();

export type CreateTestSurveyInput = {
  createdById: string;
  points: number;
};

/**
 * Черновик с суммой награды. Вопросы и тексты начислению не нужны: оно читает только
 * сумму, а заморозка суммы держится правкой, которой здесь нет.
 */
export const createTestSurvey = async (input: CreateTestSurveyInput): Promise<string> => {
  const survey = await db.survey.create({
    data: { title: 'Тестовый опрос', points: input.points, createdById: input.createdById },
  });

  createdSurveyIds.add(survey.id);

  return survey.id;
};

export type CreateFrozenTestSurveyInput = CreateTestSurveyInput & {
  /** Последний день опроса, `YYYY-MM-DD`. */
  endsOn: string;
  questions: {
    type: 'single' | 'multiple' | 'text' | 'scale';
    required: boolean;
    allowOwnAnswer?: boolean;
    options?: { exclusive?: boolean }[];
  }[];
};

export type FrozenTestSurvey = {
  surveyId: string;
  /** Вопросы по порядку, у каждого — варианты по порядку. */
  questions: { questionId: string; optionIds: string[] }[];
};

/**
 * Замороженный опрос со всеми текстами и вопросами — такой, какой уходит рассылкой и доходит
 * до водителя. Полноту на переходе проверяет база, поэтому вопросы заводятся до заморозки.
 */
export const createFrozenTestSurvey = async (input: CreateFrozenTestSurveyInput): Promise<FrozenTestSurvey> => {
  const survey = await db.survey.create({
    data: {
      title: 'Тестовый опрос',
      points: input.points,
      endsOn: new Date(`${input.endsOn}T00:00:00Z`),
      introRu: 'Вступление',
      introUz: 'Kirish',
      finishRu: 'Финал',
      finishUz: 'Yakun',
      declineButtonRu: 'Закрыть',
      declineButtonUz: 'Yopish',
      appButtonRu: 'Открыть приложение',
      appButtonUz: 'Ilovani ochish',
      createdById: input.createdById,
      questions: {
        create: input.questions.map((question, questionIndex) => ({
          position: questionIndex + 1,
          type: question.type,
          textRu: `Вопрос ${questionIndex + 1}`,
          textUz: `Savol ${questionIndex + 1}`,
          required: question.required,
          allowOwnAnswer: question.allowOwnAnswer ?? false,
          options: {
            create: (question.options ?? []).map((option, optionIndex) => ({
              position: optionIndex + 1,
              textRu: `Вариант ${optionIndex + 1}`,
              textUz: `Variant ${optionIndex + 1}`,
              exclusive: option.exclusive ?? false,
            })),
          },
        })),
      },
    },
  });

  createdSurveyIds.add(survey.id);

  await db.survey.update({ where: { id: survey.id }, data: { frozenAt: new Date() } });

  const questions = await db.surveyQuestion.findMany({
    where: { surveyId: survey.id },
    orderBy: { position: 'asc' },
    include: { options: { orderBy: { position: 'asc' } } },
  });

  return {
    surveyId: survey.id,
    questions: questions.map((question) => ({
      questionId: question.id,
      optionIds: question.options.map((option) => option.id),
    })),
  };
};

/** Опрос, заведённый сервисом, а не фикстурой, — копия. Чтобы уборка о нём тоже знала. */
export const trackTestSurvey = (surveyId: string): void => {
  createdSurveyIds.add(surveyId);
};

/** Вопросы и варианты уходят каскадом от опроса, ответы — от прохождения. */
export const cleanupTestSurveys = async (): Promise<void> => {
  const surveyIds = [...createdSurveyIds];
  createdSurveyIds.clear();

  if (surveyIds.length === 0) {
    return;
  }

  // Прохождения ссылаются на опрос ключом `RESTRICT`; ответы уходят с ними каскадом.
  await db.$executeRaw`DELETE FROM xb.survey_responses WHERE "survey_id" = ANY(${surveyIds}::uuid[])`;
  await db.$executeRaw`DELETE FROM xb.surveys WHERE "id" = ANY(${surveyIds}::uuid[])`;
};
