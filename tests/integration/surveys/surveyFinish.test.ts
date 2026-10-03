import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { SurveyFinishedError, SurveyNotFinishableError } from '#server/services/surveys/errors';
import { finishSurvey } from '#server/services/surveys/finishSurvey';
import { readMemberSurvey } from '#server/services/surveys/readMemberSurvey';
import { readMemberSurveyBanner } from '#server/services/surveys/readMemberSurveyBanner';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { cleanupTestSurveys, createFrozenTestSurvey, createTestSurvey } from '../support/surveys';

/**
 * Досрочное завершение опроса (issue #348) настоящей базой и через сервисы, которыми читают
 * и пишут ручки.
 *
 * Плашка на главной выбирается сырым SQL (`listUnfinishedSurveyResponses`), отметка ставится
 * им же (`markSurveyFinished`) — третье исключение `docs/infra.md`. Плашка: завершённый опрос
 * её не даёт, незавершённый с тем же сроком — даёт. Отметка: один раз и только у замороженного.
 */

/** Последний день — далеко впереди: закрыть опрос здесь может только отметка. */
const ENDS_ON = '2099-12-31';

const OPENED_FIRST = new Date('2026-10-03T08:00:00.000Z');
const OPENED_LAST = new Date('2026-10-03T09:00:00.000Z');
const NOW = new Date('2026-10-03T10:00:00.000Z');

/** Восемь, а не десять: каждая интерактивная транзакция держит место в пуле из десяти. */
const PARALLEL_CALLS = 8;

const createDriver = async (): Promise<LinkedDriver> => {
  const person = await createTestPerson({ inProgram: true });

  return {
    personId: person.personId,
    name: 'Тест',
    callsign: null,
    points: 0n,
    language: 'ru',
    isDemo: false,
  };
};

const createSurvey = async (createdById: string): Promise<string> =>
  (
    await createFrozenTestSurvey({
      createdById,
      points: 10,
      endsOn: ENDS_ON,
      questions: [{ type: 'single', required: true, options: [{}, {}] }],
    })
  ).surveyId;

describe('досрочное завершение опроса', () => {
  let employeeId = '';

  beforeEach(async () => {
    ({ employeeId } = await createTestEmployee({ role: 'owner' }));
  });

  afterEach(async () => {
    // Опросы — первыми: прохождение ссылается и на опрос, и на человека, а опрос — на сотрудника.
    await cleanupTestSurveys();
    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(disconnectDatabase);

  it('завершённый опрос плашки не даёт, незавершённый с тем же сроком — даёт', async () => {
    const driver = await createDriver();
    const kept = await createSurvey(employeeId);
    const finished = await createSurvey(employeeId);

    // Оба открыты, завершаемый — позже: без отметки плашка досталась бы ему.
    await readMemberSurvey(driver, kept, OPENED_FIRST);
    await readMemberSurvey(driver, finished, OPENED_LAST);

    expect((await readMemberSurveyBanner(driver, NOW))?.surveyId).toBe(finished);

    await finishSurvey(finished, employeeId);

    expect((await readMemberSurveyBanner(driver, NOW))?.surveyId).toBe(kept);

    await finishSurvey(kept, employeeId);

    expect(await readMemberSurveyBanner(driver, NOW)).toBeNull();
  });

  it('завершённый опрос водитель видит закрытым досрочно', async () => {
    const driver = await createDriver();
    const surveyId = await createSurvey(employeeId);

    const survey = await finishSurvey(surveyId, employeeId);

    expect(survey).toEqual(
      expect.objectContaining({ closed: true, endsOn: ENDS_ON, finishedByName: expect.any(String) }),
    );
    expect(survey.finishedAt).not.toBeNull();

    const screen = await readMemberSurvey(driver, surveyId, NOW);

    expect(screen.survey?.stage).toBe('closed');
    expect(screen.survey?.views.ru.closed.title).toBe('Опрос закрыт досрочно');
  });

  it('повтор и гонка нажатий ставят отметку один раз', async () => {
    const surveyId = await createSurvey(employeeId);

    const results = await Promise.allSettled(
      Array.from({ length: PARALLEL_CALLS }, () => finishSurvey(surveyId, employeeId)),
    );
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(PARALLEL_CALLS - 1);

    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(SurveyFinishedError);
    }

    await expect(finishSurvey(surveyId, employeeId)).rejects.toBeInstanceOf(SurveyFinishedError);
  });

  it('черновик не завершается', async () => {
    const surveyId = await createTestSurvey({ createdById: employeeId, points: 0 });

    await expect(finishSurvey(surveyId, employeeId)).rejects.toBeInstanceOf(SurveyNotFinishableError);
  });
});
