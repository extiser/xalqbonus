import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';

/**
 * Прохождения опросов и ответы (issue #323).
 *
 * Схема в сыром SQL указывается явно — `xb.survey_responses`, а не `survey_responses`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 *
 * Метки воронки пишутся условием «ещё пусто» в самом `UPDATE`: повторное нажатие метку
 * не сдвигает, и проверки «уже ставили» перед записью нет.
 */

type Executor = Prisma.TransactionClient;

export type SurveyResponseRow = {
  openedAt: Date;
  declinedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  appClickedAt: Date | null;
};

export type SurveyAnswerRow = {
  questionId: string;
  optionIds: string[];
  ownText: string | null;
  textValue: string | null;
  scaleValue: number | null;
};

const RESPONSE_COLUMNS = Prisma.sql`
  "opened_at"      AS "openedAt",
  "declined_at"    AS "declinedAt",
  "started_at"     AS "startedAt",
  "completed_at"   AS "completedAt",
  "app_clicked_at" AS "appClickedAt"
`;

/** Прохождение человека. Пусто — опрос он не открывал. */
export const findSurveyResponse = async (
  surveyId: string,
  personId: string,
  client: Executor = db,
): Promise<SurveyResponseRow | null> => {
  const rows = await client.$queryRaw<SurveyResponseRow[]>`
    SELECT ${RESPONSE_COLUMNS}
      FROM xb.survey_responses
     WHERE "survey_id" = ${surveyId}::uuid
       AND "person_id" = ${personId}::uuid
  `;

  return rows[0] ?? null;
};

/**
 * Первое открытие: заводит строку прохождения с `opened_at`. Повтор строку не трогает —
 * первичный ключ пары, `ON CONFLICT DO NOTHING`.
 */
export const insertSurveyOpened = async (
  surveyId: string,
  personId: string,
  client: Executor = db,
): Promise<void> => {
  await client.$executeRaw`
    INSERT INTO xb.survey_responses ("survey_id", "person_id")
    VALUES (${surveyId}::uuid, ${personId}::uuid)
    ON CONFLICT ("survey_id", "person_id") DO NOTHING
  `;
};

/**
 * Заводит строку прохождения, если её нет, и блокирует до конца транзакции. Сохранение
 * ответа и завершение идут под ней друг за другом: два «Далее» на последнем вопросе иначе
 * оба увидели бы опрос непройденным.
 */
export const lockSurveyResponse = async (
  surveyId: string,
  personId: string,
  client: Executor,
): Promise<SurveyResponseRow> => {
  await insertSurveyOpened(surveyId, personId, client);

  const rows = await client.$queryRaw<SurveyResponseRow[]>`
    SELECT ${RESPONSE_COLUMNS}
      FROM xb.survey_responses
     WHERE "survey_id" = ${surveyId}::uuid
       AND "person_id" = ${personId}::uuid
       FOR UPDATE
  `;

  const row = rows[0];

  if (!row) {
    throw new Error(`прохождение опроса ${surveyId} человеком ${personId} не прочиталось`);
  }

  return row;
};

/** Кнопка отказа на экране открытия. Метка ставится один раз; строки нет — ничего. */
export const markSurveyDeclined = async (surveyId: string, personId: string): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.survey_responses
       SET "declined_at" = now(),
           "updated_at"  = now()
     WHERE "survey_id" = ${surveyId}::uuid
       AND "person_id" = ${personId}::uuid
       AND "declined_at" IS NULL
  `;
};

/** Первый сохранённый ответ. */
export const markSurveyStarted = async (
  surveyId: string,
  personId: string,
  client: Executor,
): Promise<void> => {
  await client.$executeRaw`
    UPDATE xb.survey_responses
       SET "started_at" = now(),
           "updated_at" = now()
     WHERE "survey_id" = ${surveyId}::uuid
       AND "person_id" = ${personId}::uuid
       AND "started_at" IS NULL
  `;
};

/**
 * Опрос пройден. `true` — метку поставил этот вызов; `false` — она уже стояла, и баллы
 * за опрос звать не нужно.
 */
export const markSurveyCompleted = async (
  surveyId: string,
  personId: string,
  completedAt: Date,
  client: Executor,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.survey_responses
       SET "completed_at" = ${completedAt},
           "updated_at"   = now()
     WHERE "survey_id" = ${surveyId}::uuid
       AND "person_id" = ${personId}::uuid
       AND "completed_at" IS NULL
  `;

  return updated > 0;
};

/** Кнопка перехода в приложение на финале — только у пройденного опроса. */
export const markSurveyAppClicked = async (surveyId: string, personId: string): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.survey_responses
       SET "app_clicked_at" = now(),
           "updated_at"     = now()
     WHERE "survey_id" = ${surveyId}::uuid
       AND "person_id" = ${personId}::uuid
       AND "completed_at" IS NOT NULL
       AND "app_clicked_at" IS NULL
  `;
};

/** Сохранённые ответы человека — с выбранными вариантами по порядку вариантов. */
export const listSurveyAnswers = async (
  surveyId: string,
  personId: string,
  client: Executor = db,
): Promise<SurveyAnswerRow[]> =>
  client.$queryRaw<SurveyAnswerRow[]>`
    SELECT answer."question_id" AS "questionId",
           answer."own_text"    AS "ownText",
           answer."text_value"  AS "textValue",
           answer."scale_value"::int AS "scaleValue",
           COALESCE(
             (SELECT array_agg(chosen."option_id"::text ORDER BY option."position")
                FROM xb.survey_answer_options AS chosen
                JOIN xb.survey_options AS option ON option."id" = chosen."option_id"
               WHERE chosen."survey_id" = answer."survey_id"
                 AND chosen."person_id" = answer."person_id"
                 AND chosen."question_id" = answer."question_id"),
             ARRAY[]::text[]
           ) AS "optionIds"
      FROM xb.survey_answers AS answer
     WHERE answer."survey_id" = ${surveyId}::uuid
       AND answer."person_id" = ${personId}::uuid
  `;

export type SurveyAnswerWrite = {
  surveyId: string;
  personId: string;
  questionId: string;
  optionIds: string[];
  ownText: string | null;
  textValue: string | null;
  scaleValue: number | null;
};

/**
 * Ответ на вопрос целиком: значение заменяет прежнее, выбранные варианты — прежние варианты.
 * Вызывается под `lockSurveyResponse`, в той же транзакции.
 */
export const replaceSurveyAnswer = async (input: SurveyAnswerWrite, client: Executor): Promise<void> => {
  await client.$executeRaw`
    INSERT INTO xb.survey_answers (
      "survey_id", "person_id", "question_id", "text_value", "scale_value", "own_text"
    )
    VALUES (
      ${input.surveyId}::uuid, ${input.personId}::uuid, ${input.questionId}::uuid,
      ${input.textValue}, ${input.scaleValue}::smallint, ${input.ownText}
    )
    ON CONFLICT ("survey_id", "person_id", "question_id") DO UPDATE
       SET "text_value"  = EXCLUDED."text_value",
           "scale_value" = EXCLUDED."scale_value",
           "own_text"    = EXCLUDED."own_text",
           "updated_at"  = now()
  `;

  await client.$executeRaw`
    DELETE FROM xb.survey_answer_options
     WHERE "survey_id" = ${input.surveyId}::uuid
       AND "person_id" = ${input.personId}::uuid
       AND "question_id" = ${input.questionId}::uuid
  `;

  if (input.optionIds.length === 0) {
    return;
  }

  await client.$executeRaw`
    INSERT INTO xb.survey_answer_options ("survey_id", "person_id", "question_id", "option_id")
    SELECT ${input.surveyId}::uuid, ${input.personId}::uuid, ${input.questionId}::uuid, chosen
      FROM unnest(${input.optionIds}::uuid[]) AS chosen
  `;
};

/** Незаконченный опрос человека для плашки на главной. */
export type OpenSurveyResponseRow = {
  surveyId: string;
  /** Есть первый ответ. */
  started: boolean;
  points: number;
  /** `YYYY-MM-DD`. */
  endsOn: string;
  questionCount: number;
  /** Вопросов с сохранённым ответом — с пропущенными необязательными вместе. */
  answeredCount: number;
};

/**
 * Открытый, но не пройденный опрос с самым свежим действием — для плашки на главной. Пусто —
 * плашки нет.
 *
 * Только замороженные, не закрытые по сроку на `today` и видимые человеку: демо-опрос — только
 * демо-водителю. Начатый идёт раньше неначатого, среди равных — с самым поздним действием,
 * ответом или открытием (issue #323). Отказ плашку не убирает: «Закрыть» могли нажать случайно
 * (решение Руслана 03-10-2026).
 */
export const findOpenSurveyResponse = async (
  personId: string,
  today: string,
  personIsDemo: boolean,
  client: Executor = db,
): Promise<OpenSurveyResponseRow | null> => {
  const rows = await client.$queryRaw<OpenSurveyResponseRow[]>`
    SELECT response."survey_id"           AS "surveyId",
           response."started_at" IS NOT NULL AS "started",
           survey."points",
           survey."ends_on"::text          AS "endsOn",
           (SELECT count(*)::int
              FROM xb.survey_questions AS question
             WHERE question."survey_id" = survey."id") AS "questionCount",
           (SELECT count(*)::int
              FROM xb.survey_answers AS answer
             WHERE answer."survey_id" = response."survey_id"
               AND answer."person_id" = response."person_id") AS "answeredCount"
      FROM xb.survey_responses AS response
      JOIN xb.surveys AS survey ON survey."id" = response."survey_id"
     WHERE response."person_id" = ${personId}::uuid
       AND response."completed_at" IS NULL
       AND survey."frozen_at" IS NOT NULL
       AND survey."ends_on" >= ${today}::date
       AND (NOT survey."is_demo" OR ${personIsDemo}::boolean)
     ORDER BY response."started_at" IS NOT NULL DESC,
              GREATEST(
                response."opened_at",
                (SELECT max(answer."updated_at")
                   FROM xb.survey_answers AS answer
                  WHERE answer."survey_id" = response."survey_id"
                    AND answer."person_id" = response."person_id")
              ) DESC
     LIMIT 1
  `;

  return rows[0] ?? null;
};
