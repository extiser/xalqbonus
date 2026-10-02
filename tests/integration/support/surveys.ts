import { db } from '#server/db';

/**
 * Опросы для тестов начисления баллов за опрос (issue #322).
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

/** Опрос, заведённый сервисом, а не фикстурой, — копия. Чтобы уборка о нём тоже знала. */
export const trackTestSurvey = (surveyId: string): void => {
  createdSurveyIds.add(surveyId);
};

/** Вопросы и варианты уходят каскадом от опроса. */
export const cleanupTestSurveys = async (): Promise<void> => {
  const surveyIds = [...createdSurveyIds];
  createdSurveyIds.clear();

  if (surveyIds.length === 0) {
    return;
  }

  await db.$executeRaw`DELETE FROM xb.surveys WHERE "id" = ANY(${surveyIds}::uuid[])`;
};
