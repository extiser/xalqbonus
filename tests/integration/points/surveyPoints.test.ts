import { readFileSync } from 'node:fs';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import {
  awardSurveyPoints,
  type AwardSurveyPointsResult,
} from '#server/services/points/awardSurveyPoints';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { buildSurveyIdempotencyKey } from '#server/services/points/idempotencyKey';
import { copySurvey } from '#server/services/surveys/copySurvey';
import {
  cleanupTestData,
  countTransfersByKey,
  countTransfersByReason,
  createTestPerson,
  disconnectDatabase,
  readAccountBalance,
  readTransferByKey,
  runRawQuery,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { cleanupTestSurveys, createTestSurvey, trackTestSurvey } from '../support/surveys';

/**
 * Баллы за пройденный опрос (issue #322): сумма опроса, разово на человека и опрос.
 *
 * Настоящей базой: разовость держит уникальное ограничение на ключ, а не код, и заглушка
 * подтвердила бы работу кода, а не правила.
 */

const SURVEY_POINTS = 25;

const COMPLETED_AT = new Date('2026-10-03T09:00:00.000Z');

/** Восемь, а не десять: каждая интерактивная транзакция держит место в пуле из десяти. */
const PARALLEL_CALLS = 8;

const INVARIANTS_PATH = new URL('../../../scripts/invariants.sql', import.meta.url);

/** Запросы инвариантов журнала — тот же файл, что гоняет `make invariants`. */
const readInvariantQueries = (): string[] => {
  const source = readFileSync(INVARIANTS_PATH, 'utf8');
  const blocks = [...source.matchAll(/-- invariant:begin \d+\n([\s\S]*?)\n-- invariant:end/g)];

  return blocks.map((block) => block[1]!.trim());
};

/** Участник программы со счётом — тот, кто доходит до финала опроса. */
const createParticipant = async (): Promise<string> => {
  const person = await createTestPerson({ inProgram: true });
  await ensureDriverAccount(person.personId);

  return person.personId;
};

/**
 * Завершение опроса: начисление внутри транзакции вызывающего, как его позовёт отметка
 * «опрос пройден».
 */
const completeSurvey = (surveyId: string, personId: string): Promise<AwardSurveyPointsResult> =>
  db.$transaction((transaction) =>
    awardSurveyPoints({ surveyId, personId, occurredAt: COMPLETED_AT, client: transaction }),
  );

describe('баллы за опрос', () => {
  let employeeId = '';

  beforeEach(async () => {
    ({ employeeId } = await createTestEmployee({ role: 'owner' }));
  });

  afterEach(async () => {
    await cleanupTestData();
    await cleanupTestSurveys();
    await cleanupTestEmployees();
  });
  afterAll(disconnectDatabase);

  it('ставит одну запись с причиной survey и ключом опроса и человека', async () => {
    const personId = await createParticipant();
    const surveyId = await createTestSurvey({ createdById: employeeId, points: SURVEY_POINTS });

    const result = await completeSurvey(surveyId, personId);

    expect(result).toEqual({ applied: true, points: SURVEY_POINTS });

    const idempotencyKey = buildSurveyIdempotencyKey(surveyId, personId);
    expect(idempotencyKey).toBe(`survey:${surveyId}:${personId}`);
    expect(await countTransfersByKey(idempotencyKey)).toBe(1);
    expect(await readTransferByKey(idempotencyKey)).toMatchObject({
      reason: 'survey',
      amount: BigInt(SURVEY_POINTS),
    });
    expect(await readAccountBalance(personId)).toBe(BigInt(SURVEY_POINTS));
  });

  it('повторный вызов не создаёт второй записи и отдаёт ту же сумму', async () => {
    // Финал нажимают дважды — и он обязан показать баллы и во второй раз.
    const personId = await createParticipant();
    const surveyId = await createTestSurvey({ createdById: employeeId, points: SURVEY_POINTS });

    await completeSurvey(surveyId, personId);
    const repeat = await completeSurvey(surveyId, personId);

    expect(repeat).toEqual({ applied: false, points: SURVEY_POINTS });
    expect(await countTransfersByKey(buildSurveyIdempotencyKey(surveyId, personId))).toBe(1);
    expect(await readAccountBalance(personId)).toBe(BigInt(SURVEY_POINTS));
  });

  it('другой опрос того же человека — вторая запись, и копия тоже', async () => {
    // Копия — новый опрос с новым `id`, и за неё баллы приходят снова (docs/points.md).
    const personId = await createParticipant();
    const surveyId = await createTestSurvey({ createdById: employeeId, points: SURVEY_POINTS });
    const otherSurveyId = await createTestSurvey({ createdById: employeeId, points: 10 });
    const copy = await copySurvey(surveyId, employeeId);
    trackTestSurvey(copy.surveyId);

    const results = [
      await completeSurvey(surveyId, personId),
      await completeSurvey(otherSurveyId, personId),
      await completeSurvey(copy.surveyId, personId),
    ];

    expect(results.every((result) => result.applied)).toBe(true);
    expect(await countTransfersByReason(personId, 'survey')).toBe(3);
    expect(await readAccountBalance(personId)).toBe(BigInt(SURVEY_POINTS + 10 + SURVEY_POINTS));
  });

  it('тот же опрос, другой человек — своя запись', async () => {
    const firstPersonId = await createParticipant();
    const secondPersonId = await createParticipant();
    const surveyId = await createTestSurvey({ createdById: employeeId, points: SURVEY_POINTS });

    const first = await completeSurvey(surveyId, firstPersonId);
    const second = await completeSurvey(surveyId, secondPersonId);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(true);
    expect(await countTransfersByKey(buildSurveyIdempotencyKey(surveyId, firstPersonId))).toBe(1);
    expect(await countTransfersByKey(buildSurveyIdempotencyKey(surveyId, secondPersonId))).toBe(1);
    expect(await readAccountBalance(firstPersonId)).toBe(BigInt(SURVEY_POINTS));
    expect(await readAccountBalance(secondPersonId)).toBe(BigInt(SURVEY_POINTS));
  });

  it('опрос без награды — записи нет, баланс не меняется', async () => {
    const personId = await createParticipant();
    const surveyId = await createTestSurvey({ createdById: employeeId, points: 0 });

    const result = await completeSurvey(surveyId, personId);

    expect(result).toEqual({ applied: false, points: 0 });
    expect(await countTransfersByKey(buildSurveyIdempotencyKey(surveyId, personId))).toBe(0);
    expect(await readAccountBalance(personId)).toBe(0n);
  });

  it('параллельные вызовы для одной пары дают одну запись', async () => {
    const personId = await createParticipant();
    const surveyId = await createTestSurvey({ createdById: employeeId, points: SURVEY_POINTS });

    const results = await Promise.all(
      Array.from({ length: PARALLEL_CALLS }, () => completeSurvey(surveyId, personId)),
    );

    // Записал ровно один вызов, остальные опознали повтор — и тоже знают сумму.
    expect(results.filter((result) => result.applied)).toHaveLength(1);
    expect(results.every((result) => result.points === SURVEY_POINTS)).toBe(true);
    expect(await countTransfersByKey(buildSurveyIdempotencyKey(surveyId, personId))).toBe(1);
    expect(await readAccountBalance(personId)).toBe(BigInt(SURVEY_POINTS));
  });

  it('после всех случаев инварианты журнала держатся', async () => {
    const firstPersonId = await createParticipant();
    const secondPersonId = await createParticipant();
    const surveyId = await createTestSurvey({ createdById: employeeId, points: SURVEY_POINTS });
    const otherSurveyId = await createTestSurvey({ createdById: employeeId, points: 10 });
    const emptySurveyId = await createTestSurvey({ createdById: employeeId, points: 0 });
    const copy = await copySurvey(surveyId, employeeId);
    trackTestSurvey(copy.surveyId);

    await completeSurvey(surveyId, firstPersonId);
    await completeSurvey(surveyId, firstPersonId);
    await completeSurvey(otherSurveyId, firstPersonId);
    await completeSurvey(copy.surveyId, firstPersonId);
    await completeSurvey(emptySurveyId, firstPersonId);
    await Promise.all(
      Array.from({ length: PARALLEL_CALLS }, () => completeSurvey(surveyId, secondPersonId)),
    );

    const queries = readInvariantQueries();
    expect(queries).toHaveLength(4);

    for (const query of queries) {
      await expect(runRawQuery(query)).resolves.toEqual([]);
    }
  });
});
