import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { buildSurveyIdempotencyKey } from '#server/services/points/idempotencyKey';
import { readMemberSurvey } from '#server/services/surveys/readMemberSurvey';
import { readMemberSurveyBanner } from '#server/services/surveys/readMemberSurveyBanner';
import { saveMemberSurveyAnswer } from '#server/services/surveys/saveMemberSurveyAnswer';
import type { MemberSurveyAnswer } from '#shared/types/memberSurvey';
import {
  cleanupTestData,
  countTransfersByKey,
  createTestPerson,
  disconnectDatabase,
  readAccountBalance,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { cleanupTestSurveys, createFrozenTestSurvey, type FrozenTestSurvey } from '../support/surveys';

/**
 * Завершение опроса (issue #323): ответ на последний вопрос ставит `completed_at` и начисляет
 * баллы одной транзакцией, повтор завершения второй записи в журнале не даёт.
 *
 * Настоящей базой и через сервис, которым ответ сохраняет ручка: разовость держат условие
 * «ещё пусто» на метке и уникальный ключ перевода, а не код.
 */

const SURVEY_POINTS = 40;

const NOW = new Date('2026-10-03T09:00:00.000Z');

/** Последний день опроса — далеко впереди: срок здесь не проверяется. */
const ENDS_ON = '2099-12-31';

/** Восемь, а не десять: каждая интерактивная транзакция держит место в пуле из десяти. */
const PARALLEL_CALLS = 8;

const driverOf = (personId: string): LinkedDriver => ({
  personId,
  name: 'Тест',
  callsign: null,
  points: 0n,
  language: 'ru',
  isDemo: false,
});

/** Участник программы со счётом — тот, кто доходит до финала опроса. */
const createParticipant = async (): Promise<LinkedDriver> => {
  const person = await createTestPerson({ inProgram: true });
  await ensureDriverAccount(person.personId);

  return driverOf(person.personId);
};

/** Обязательный вопрос с одним ответом и необязательный свободный — последний. */
const createSurvey = (createdById: string): Promise<FrozenTestSurvey> =>
  createFrozenTestSurvey({
    createdById,
    points: SURVEY_POINTS,
    endsOn: ENDS_ON,
    questions: [
      { type: 'single', required: true, options: [{}, {}] },
      { type: 'text', required: false },
    ],
  });

const emptyAnswer = (questionId: string): MemberSurveyAnswer => ({
  questionId,
  optionIds: [],
  ownText: null,
  textValue: null,
  scaleValue: null,
});

const readCompletedAt = async (surveyId: string, personId: string): Promise<Date | null> => {
  const response = await db.surveyResponse.findUnique({
    where: { surveyId_personId: { surveyId, personId } },
  });

  return response?.completedAt ?? null;
};

describe('завершение опроса', () => {
  let employeeId = '';

  beforeEach(async () => {
    ({ employeeId } = await createTestEmployee({ role: 'owner' }));
  });

  afterEach(async () => {
    // Опросы — первыми: прохождение ссылается и на опрос, и на человека.
    await cleanupTestSurveys();
    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(disconnectDatabase);

  it('ответ на последний вопрос ставит completed_at и запись в журнале вместе', async () => {
    const driver = await createParticipant();
    const survey = await createSurvey(employeeId);
    const [first, last] = survey.questions;
    const idempotencyKey = buildSurveyIdempotencyKey(survey.surveyId, driver.personId);

    const opened = await readMemberSurvey(driver, survey.surveyId, NOW);
    expect(opened.survey?.stage).toBe('intro');

    const afterFirst = await saveMemberSurveyAnswer(
      driver,
      survey.surveyId,
      { ...emptyAnswer(first!.questionId), optionIds: [first!.optionIds[1]!] },
      NOW,
    );

    // Не последний вопрос — ни отметки, ни баллов; на главной — «Опрос не закончен».
    expect(afterFirst.survey?.stage).toBe('questions');
    expect(await readCompletedAt(survey.surveyId, driver.personId)).toBeNull();
    expect(await countTransfersByKey(idempotencyKey)).toBe(0);
    expect((await readMemberSurveyBanner(driver, NOW))?.title).toBe('Остался 1 вопрос');

    // Необязательный последний пропущен — опрос всё равно пройден.
    const finished = await saveMemberSurveyAnswer(driver, survey.surveyId, emptyAnswer(last!.questionId), NOW);

    expect(finished.survey?.stage).toBe('finish');
    expect(finished.survey?.views.ru.finish.gain).toEqual({
      amount: `+${SURVEY_POINTS}`,
      caption: 'баллов уже на балансе',
    });
    expect(finished.survey?.answers).toHaveLength(2);
    expect(await readCompletedAt(survey.surveyId, driver.personId)).toEqual(NOW);
    expect(await countTransfersByKey(idempotencyKey)).toBe(1);
    expect(await readAccountBalance(driver.personId)).toBe(BigInt(SURVEY_POINTS));
    expect(await readMemberSurveyBanner(driver, NOW)).toBeNull();
  });

  it('повтор завершения отвечает финалом с той же суммой и второй записи не даёт', async () => {
    const driver = await createParticipant();
    const survey = await createSurvey(employeeId);
    const [first, last] = survey.questions;

    await saveMemberSurveyAnswer(
      driver,
      survey.surveyId,
      { ...emptyAnswer(first!.questionId), optionIds: [first!.optionIds[0]!] },
      NOW,
    );
    await saveMemberSurveyAnswer(driver, survey.surveyId, emptyAnswer(last!.questionId), NOW);

    // Второе «Далее» и попытка заменить ответ после завершения: финал, ответ прежний.
    const repeat = await saveMemberSurveyAnswer(
      driver,
      survey.surveyId,
      { ...emptyAnswer(first!.questionId), optionIds: [first!.optionIds[1]!] },
      NOW,
    );
    const reopened = await readMemberSurvey(driver, survey.surveyId, NOW);

    for (const response of [repeat, reopened]) {
      expect(response.survey?.stage).toBe('finish');
      expect(response.survey?.views.ru.finish.gain?.amount).toBe(`+${SURVEY_POINTS}`);
      expect(response.survey?.answers.find((answer) => answer.questionId === first!.questionId)?.optionIds).toEqual([
        first!.optionIds[0],
      ]);
    }

    expect(await countTransfersByKey(buildSurveyIdempotencyKey(survey.surveyId, driver.personId))).toBe(1);
    expect(await readAccountBalance(driver.personId)).toBe(BigInt(SURVEY_POINTS));
  });

  it('параллельные ответы на последний вопрос дают одну запись', async () => {
    const driver = await createParticipant();
    const survey = await createSurvey(employeeId);
    const [first, last] = survey.questions;

    await saveMemberSurveyAnswer(
      driver,
      survey.surveyId,
      { ...emptyAnswer(first!.questionId), optionIds: [first!.optionIds[0]!] },
      NOW,
    );

    const results = await Promise.all(
      Array.from({ length: PARALLEL_CALLS }, () =>
        saveMemberSurveyAnswer(driver, survey.surveyId, emptyAnswer(last!.questionId), NOW),
      ),
    );

    // Все видят финал с той же суммой, начислил один.
    expect(results.every((result) => result.survey?.stage === 'finish')).toBe(true);
    expect(results.every((result) => result.survey?.views.ru.finish.gain?.amount === `+${SURVEY_POINTS}`)).toBe(true);
    expect(await countTransfersByKey(buildSurveyIdempotencyKey(survey.surveyId, driver.personId))).toBe(1);
    expect(await readAccountBalance(driver.personId)).toBe(BigInt(SURVEY_POINTS));
  });
});
