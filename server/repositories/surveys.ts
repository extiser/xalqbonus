import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { SurveyQuestionType } from '#server/generated/prisma/enums';

/**
 * Опросы, их вопросы и варианты (issue #320).
 *
 * Схема в сыром SQL указывается явно — `xb.surveys`, а не `surveys`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 *
 * Правка содержимого пишется условием «ещё не заморожен» в самом запросе и идёт под
 * блокировкой строки опроса (`lockSurvey`): заморозку ставит запуск рассылки, и правка,
 * проверившая признак до запуска, а записавшая после, иначе поменяла бы уже ушедший опрос.
 *
 * Дата окончания читается строкой `YYYY-MM-DD`: календарный день, и перевод его в момент
 * времени ничего, кроме сдвига зоны, не добавил бы.
 */

type Executor = Prisma.TransactionClient;

export type SurveyTextsRow = {
  introRu: string | null;
  introUz: string | null;
  finishRu: string | null;
  finishUz: string | null;
  declineButtonRu: string | null;
  declineButtonUz: string | null;
  appButtonRu: string | null;
  appButtonUz: string | null;
};

export type SurveyRow = SurveyTextsRow & {
  id: string;
  /** Пусто только у черновика — проверкой `surveys_frozen_complete_check`. */
  title: string | null;
  points: number;
  /** `YYYY-MM-DD`. Пусто только у черновика. */
  endsOn: string | null;
  frozenAt: Date | null;
  isDemo: boolean;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SurveyListRow = Omit<SurveyRow, keyof SurveyTextsRow | 'updatedAt'> & {
  questionCount: number;
};

export type SurveyQuestionRow = {
  id: string;
  type: SurveyQuestionType;
  textRu: string | null;
  textUz: string | null;
  required: boolean;
  allowOwnAnswer: boolean;
};

export type SurveyOptionRow = {
  id: string;
  questionId: string;
  textRu: string | null;
  textUz: string | null;
  exclusive: boolean;
};

const SURVEY_COLUMNS = Prisma.sql`
  survey."id",
  survey."title",
  survey."points",
  survey."ends_on"::text      AS "endsOn",
  survey."frozen_at"          AS "frozenAt",
  survey."is_demo"            AS "isDemo",
  author."full_name"          AS "createdByName",
  survey."created_at"         AS "createdAt"
`;

/** Все опросы, свежие первыми, с числом вопросов. Их единицы и десятки, страниц не нужно. */
export const listSurveys = async (client: Executor = db): Promise<SurveyListRow[]> =>
  client.$queryRaw<SurveyListRow[]>`
    SELECT ${SURVEY_COLUMNS},
           (SELECT count(*)::int
              FROM xb.survey_questions AS question
             WHERE question."survey_id" = survey."id") AS "questionCount"
      FROM xb.surveys AS survey
      JOIN xb.employees AS author ON author."id" = survey."created_by_id"
     ORDER BY survey."created_at" DESC
  `;

export const findSurvey = async (
  surveyId: string,
  client: Executor = db,
): Promise<SurveyRow | null> => {
  const rows = await client.$queryRaw<SurveyRow[]>`
    SELECT ${SURVEY_COLUMNS},
           survey."intro_ru"          AS "introRu",
           survey."intro_uz"          AS "introUz",
           survey."finish_ru"         AS "finishRu",
           survey."finish_uz"         AS "finishUz",
           survey."decline_button_ru" AS "declineButtonRu",
           survey."decline_button_uz" AS "declineButtonUz",
           survey."app_button_ru"     AS "appButtonRu",
           survey."app_button_uz"     AS "appButtonUz",
           survey."updated_at"        AS "updatedAt"
      FROM xb.surveys AS survey
      JOIN xb.employees AS author ON author."id" = survey."created_by_id"
     WHERE survey."id" = ${surveyId}::uuid
  `;

  return rows[0] ?? null;
};

/** Вопросы опроса по порядку. */
export const listSurveyQuestions = async (
  surveyId: string,
  client: Executor = db,
): Promise<SurveyQuestionRow[]> =>
  client.$queryRaw<SurveyQuestionRow[]>`
    SELECT "id", "type", "text_ru" AS "textRu", "text_uz" AS "textUz", "required",
           "allow_own_answer" AS "allowOwnAnswer"
      FROM xb.survey_questions
     WHERE "survey_id" = ${surveyId}::uuid
     ORDER BY "position"
  `;

/** Варианты всех вопросов опроса — по порядку внутри вопроса. */
export const listSurveyOptions = async (
  surveyId: string,
  client: Executor = db,
): Promise<SurveyOptionRow[]> =>
  client.$queryRaw<SurveyOptionRow[]>`
    SELECT option."id",
           option."question_id" AS "questionId",
           option."text_ru"     AS "textRu",
           option."text_uz"     AS "textUz",
           option."exclusive"
      FROM xb.survey_options AS option
      JOIN xb.survey_questions AS question ON question."id" = option."question_id"
     WHERE question."survey_id" = ${surveyId}::uuid
     ORDER BY question."position", option."position"
  `;

/**
 * Блокирует строку опроса до конца транзакции и говорит, заморожен ли он. Пусто — опроса нет.
 * Заморозка — `UPDATE` той же строки, поэтому правка и запуск рассылки идут друг за другом.
 */
export const lockSurvey = async (
  surveyId: string,
  client: Executor,
): Promise<{ frozen: boolean } | null> => {
  const rows = await client.$queryRaw<{ frozen: boolean }[]>`
    SELECT "frozen_at" IS NOT NULL AS "frozen"
      FROM xb.surveys
     WHERE "id" = ${surveyId}::uuid
       FOR UPDATE
  `;

  return rows[0] ?? null;
};

/** Название и срок — то, что правится и у замороженного. */
export type SurveySettingsInput = {
  title: string | null;
  endsOn: string | null;
};

/** Содержимое — то, что замораживается. Вопросы пишутся отдельно, `replaceSurveyQuestions`. */
export type SurveyContentRowInput = SurveyTextsRow & {
  points: number;
};

export type InsertSurveyInput = SurveySettingsInput &
  SurveyContentRowInput & {
    createdById: string;
    /** Признак демо ставится только здесь: правка его не трогает (issue #212). */
    isDemo: boolean;
  };

/** Заводит черновик. Возвращает идентификатор. */
export const insertDraftSurvey = async (input: InsertSurveyInput, client: Executor): Promise<string> => {
  const rows = await client.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.surveys (
      "title", "ends_on", "points",
      "intro_ru", "intro_uz", "finish_ru", "finish_uz",
      "decline_button_ru", "decline_button_uz", "app_button_ru", "app_button_uz",
      "created_by_id", "is_demo"
    )
    VALUES (
      ${input.title}, ${input.endsOn}::date, ${input.points},
      ${input.introRu}, ${input.introUz}, ${input.finishRu}, ${input.finishUz},
      ${input.declineButtonRu}, ${input.declineButtonUz}, ${input.appButtonRu}, ${input.appButtonUz},
      ${input.createdById}::uuid, ${input.isDemo}
    )
    RETURNING "id"
  `;

  const row = rows[0];

  if (!row) {
    throw new Error('вставка опроса не вернула строку');
  }

  return row.id;
};

/**
 * Название и срок. Правятся у любого опроса: служебное название ответы не трогает, а срок
 * может понадобиться продлить. Пустые у замороженного не пропустит проверка базы.
 */
export const updateSurveySettings = async (
  surveyId: string,
  input: SurveySettingsInput,
  client: Executor,
): Promise<void> => {
  await client.$executeRaw`
    UPDATE xb.surveys
       SET "title"      = ${input.title},
           "ends_on"    = ${input.endsOn}::date,
           "updated_at" = now()
     WHERE "id" = ${surveyId}::uuid
  `;
};

/** Тексты и баллы черновика. `false` — строки нет или опрос уже заморожен. */
export const updateDraftSurveyContent = async (
  surveyId: string,
  input: SurveyContentRowInput,
  client: Executor,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.surveys
       SET "points"            = ${input.points},
           "intro_ru"          = ${input.introRu},
           "intro_uz"          = ${input.introUz},
           "finish_ru"         = ${input.finishRu},
           "finish_uz"         = ${input.finishUz},
           "decline_button_ru" = ${input.declineButtonRu},
           "decline_button_uz" = ${input.declineButtonUz},
           "app_button_ru"     = ${input.appButtonRu},
           "app_button_uz"     = ${input.appButtonUz},
           "updated_at"        = now()
     WHERE "id" = ${surveyId}::uuid
       AND "frozen_at" IS NULL
  `;

  return updated > 0;
};

export type SurveyQuestionInsert = {
  type: SurveyQuestionType;
  textRu: string | null;
  textUz: string | null;
  required: boolean;
  allowOwnAnswer: boolean;
  options: { textRu: string | null; textUz: string | null; exclusive: boolean }[];
};

/**
 * Вопросы и варианты черновика — целиком, тем порядком, что пришёл. Прежние удаляются:
 * у черновика ответов нет, и ссылаться на старые строки некому. Варианты уходят вместе
 * с вопросами каскадом.
 *
 * Вызывается только под `lockSurvey` у незамороженного опроса — в той же транзакции.
 */
export const replaceSurveyQuestions = async (
  surveyId: string,
  questions: SurveyQuestionInsert[],
  client: Executor,
): Promise<void> => {
  await client.$executeRaw`
    DELETE FROM xb.survey_questions WHERE "survey_id" = ${surveyId}::uuid
  `;

  for (const [questionIndex, question] of questions.entries()) {
    const rows = await client.$queryRaw<{ id: string }[]>`
      INSERT INTO xb.survey_questions (
        "survey_id", "position", "type", "text_ru", "text_uz", "required", "allow_own_answer"
      )
      VALUES (
        ${surveyId}::uuid,
        ${questionIndex + 1},
        ${question.type}::xb.survey_question_type,
        ${question.textRu},
        ${question.textUz},
        ${question.required},
        ${question.allowOwnAnswer}
      )
      RETURNING "id"
    `;

    const questionRow = rows[0];

    if (!questionRow) {
      throw new Error('вставка вопроса не вернула строку');
    }

    for (const [optionIndex, option] of question.options.entries()) {
      await client.$executeRaw`
        INSERT INTO xb.survey_options ("question_id", "position", "text_ru", "text_uz", "exclusive")
        VALUES (
          ${questionRow.id}::uuid,
          ${optionIndex + 1},
          ${option.textRu},
          ${option.textUz},
          ${option.exclusive}
        )
      `;
    }
  }
};

/**
 * Удаляет черновик физически — вопросы и варианты уходят каскадом. `false` — строки нет,
 * опрос заморожен или прикреплён к рассылке (issue #321): условия стоят в самом `DELETE`,
 * а не проверкой перед ним. Прикреплённый черновик не удаляется — откреплять его молча
 * значило бы менять чужой черновик рассылки.
 */
export const deleteDraftSurvey = async (surveyId: string, client: Executor = db): Promise<boolean> => {
  const deleted = await client.$executeRaw`
    DELETE FROM xb.surveys AS survey
     WHERE survey."id" = ${surveyId}::uuid
       AND survey."frozen_at" IS NULL
       AND NOT EXISTS (
             SELECT 1 FROM xb.mailings AS mailing
              WHERE mailing."survey_id" = survey."id"
           )
  `;

  return deleted > 0;
};

/**
 * Замораживает опрос — запуском рассылки с ним (issue #321), в той же транзакции, что смена
 * статуса рассылки и снимок. Условие «ещё не заморожен» в самом `UPDATE`: замороженный
 * прежней рассылкой повторно не замораживается, и `frozen_at` остаётся моментом первой.
 * `false` — уже был заморожен.
 *
 * Полноту на переходе проверяет база (`surveys_frozen_complete_check`, триггер
 * `surveys_frozen_questions`); вызывающий проверил её раньше, чтобы назвать причины словами.
 */
export const freezeSurvey = async (surveyId: string, client: Executor): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.surveys
       SET "frozen_at"  = now(),
           "updated_at" = now()
     WHERE "id" = ${surveyId}::uuid
       AND "frozen_at" IS NULL
  `;

  return updated > 0;
};
