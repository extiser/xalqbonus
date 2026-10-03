import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { exportMailingSurveyResults } from '#server/services/mailings/exportMailingSurveyResults';
import { readMailingSurveyResults } from '#server/services/mailings/readMailingSurveyResults';
import { createSegment } from '#server/services/segments/createSegment';
import { readSurveyResults } from '#server/services/surveys/readSurveyResults';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import type { SurveyQuestionResult } from '#shared/types/surveyResults';
import {
  cleanupTestData,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
  type TestPerson,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { cleanupTestMailings, trackTestMailing } from '../support/mailings';
import { grantPoints } from '../support/points';
import { cleanupTestSegments, trackTestSegment } from '../support/segments';
import { cleanupTestSurveys, createFrozenTestSurvey, type FrozenTestSurvey } from '../support/surveys';

/**
 * Итоги опроса (issue #325): воронка, «Где бросают», ответы по вопросам, срезы, выгрузка
 * и рассылки опроса со сводной воронкой.
 *
 * Все запросы здесь сырые и читают чужие таблицы — `mailing_recipients`, `mailings`,
 * `survey_responses`, `survey_answers`, `survey_answer_options`, `survey_questions`,
 * `park_profiles`, `person_settings`, `trips`, а срез по сегменту — всё, что читает
 * `segmentMembersSql`. Миграция в любой из них ломает итоги молча: типы расхождения со схемой
 * не ловят (docs/infra.md → «Тесты», третье исключение). Тест гоняет их через сервисы — тем
 * путём, которым их зовут ручки.
 *
 * Набор маленький: прошедший, отказавшийся, бросивший на втором вопросе и адресат, до которого
 * сообщение не дошло. Мир — демо: срез по активности считает порог по всем участникам мира,
 * а демо-участников с поездками в тестовой базе, кроме людей этого файла, нет.
 *
 * Снимок, метки и ответы пишутся фикстурой, мимо запуска и экрана опроса: под тестом чтение
 * итогов, а запись покрыта своими тестами (`mailings.test.ts`, `surveyCompletion.test.ts`).
 */

/** Окно баланса среза по сегменту — его нет ни у кого, кроме прошедшего из этого файла. */
const BALANCE_FROM = 7_325_000;
const BALANCE_TO = 7_325_999;

const DAY_MS = 24 * 60 * 60 * 1_000;

/** Запуск — сейчас: поездки трое суток назад лежат в окне 30 суток до суток запуска. */
const TRIP_DAYS_AGO = 3;

type Cast = {
  employeeId: string;
  survey: FrozenTestSurvey;
  completer: TestPerson;
  decliner: TestPerson;
  dropper: TestPerson;
  undelivered: TestPerson;
  mailingId: string;
  reminderId: string;
};

let tripSequence = 0;

const createDemoParticipant = async (): Promise<TestPerson> => {
  const person = await createTestPerson({ inProgram: true });
  await db.person.update({ where: { id: person.personId }, data: { isDemo: true } });

  return person;
};

const addCompletedTrips = async (person: TestPerson, count: number): Promise<void> => {
  for (let tripIndex = 0; tripIndex < count; tripIndex += 1) {
    tripSequence += 1;

    await createTestTrip({
      profileId: person.profileId,
      tripOrderId: `test-survey-results-trip-${person.personId}-${tripSequence}`,
      status: COMPLETED_TRIP_STATUS,
      endedAt: new Date(Date.now() - TRIP_DAYS_AGO * DAY_MS),
    });
  }
};

/**
 * Запущенная демо-рассылка с опросом и снимком: доставленным — исход `sent`, остальным —
 * `pending`. Запуск — столько-то часов назад: список рассылок опроса идёт по порядку запуска.
 */
const createLaunchedMailing = async (
  createdById: string,
  surveyId: string,
  hoursAgo: number,
  recipients: { personId: string; delivered: boolean }[],
): Promise<string> => {
  const startedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1_000);
  const mailing = await db.mailing.create({
    data: {
      title: 'Тестовая рассылка с опросом',
      textRu: 'Привет',
      textUz: 'Salom',
      status: 'finished',
      startedAt,
      finishedAt: startedAt,
      isDemo: true,
      surveyId,
      createdById,
    },
  });

  trackTestMailing(mailing.id);

  await db.mailingRecipient.createMany({
    data: recipients.map((recipient, index) => ({
      mailingId: mailing.id,
      personId: recipient.personId,
      outcome: recipient.delivered ? 'sent' : 'pending',
      outcomeAt: recipient.delivered ? startedAt : null,
      messageId: recipient.delivered ? BigInt(index + 1) : null,
    })),
  });

  return mailing.id;
};

const saveAnswer = async (
  surveyId: string,
  personId: string,
  questionId: string,
  value: { optionIds?: string[]; ownText?: string; textValue?: string; scaleValue?: number },
): Promise<void> => {
  await db.surveyAnswer.create({
    data: {
      surveyId,
      personId,
      questionId,
      ownText: value.ownText ?? null,
      textValue: value.textValue ?? null,
      scaleValue: value.scaleValue ?? null,
      options: { create: (value.optionIds ?? []).map((optionId) => ({ optionId })) },
    },
  });
};

/**
 * Опрос из четырёх вопросов всех типов: один ответ со «Своим вариантом», несколько ответов,
 * шкала и необязательный текст.
 */
const setUp = async (): Promise<Cast> => {
  const { employeeId } = await createTestEmployee({ role: 'owner' });
  const survey = await createFrozenTestSurvey({
    createdById: employeeId,
    points: 0,
    endsOn: '2099-12-31',
    questions: [
      { type: 'single', required: true, allowOwnAnswer: true, options: [{}, {}] },
      { type: 'multiple', required: true, options: [{}, {}] },
      { type: 'scale', required: true },
      { type: 'text', required: false },
    ],
  });
  await db.survey.update({ where: { id: survey.surveyId }, data: { isDemo: true } });

  const completer = await createDemoParticipant();
  const decliner = await createDemoParticipant();
  const dropper = await createDemoParticipant();
  const undelivered = await createDemoParticipant();

  await db.parkProfile.update({ where: { profileId: completer.profileId }, data: { callsign: 'T325' } });
  await db.personSettings.update({ where: { personId: dropper.personId }, data: { language: 'uz' } });

  const mailingId = await createLaunchedMailing(employeeId, survey.surveyId, 2, [
    { personId: completer.personId, delivered: true },
    { personId: decliner.personId, delivered: true },
    { personId: dropper.personId, delivered: true },
    { personId: undelivered.personId, delivered: false },
  ]);
  const reminderId = await createLaunchedMailing(employeeId, survey.surveyId, 1, [
    { personId: completer.personId, delivered: true },
    { personId: dropper.personId, delivered: true },
  ]);

  const [single, multiple, scale, text] = survey.questions;

  if (!single || !multiple || !scale || !text) {
    throw new Error('вопросы опроса не завелись');
  }

  const moment = new Date();
  const { surveyId } = survey;

  await db.surveyResponse.create({
    data: {
      surveyId,
      personId: completer.personId,
      startedAt: moment,
      completedAt: moment,
      appClickedAt: moment,
    },
  });
  await saveAnswer(surveyId, completer.personId, single.questionId, { optionIds: [single.optionIds[0] ?? ''] });
  await saveAnswer(surveyId, completer.personId, multiple.questionId, { optionIds: multiple.optionIds });
  await saveAnswer(surveyId, completer.personId, scale.questionId, { scaleValue: 5 });
  await saveAnswer(surveyId, completer.personId, text.questionId, { textValue: '=Отлично' });

  await db.surveyResponse.create({ data: { surveyId, personId: decliner.personId, declinedAt: moment } });

  await db.surveyResponse.create({ data: { surveyId, personId: dropper.personId, startedAt: moment } });
  await saveAnswer(surveyId, dropper.personId, single.questionId, { ownText: 'Своё' });
  await saveAnswer(surveyId, dropper.personId, multiple.questionId, { optionIds: [multiple.optionIds[1] ?? ''] });

  return { employeeId, survey, completer, decliner, dropper, undelivered, mailingId, reminderId };
};

const questionAt = (questions: SurveyQuestionResult[], position: number): SurveyQuestionResult => {
  const question = questions.find((candidate) => candidate.position === position);

  if (!question) {
    throw new Error(`вопроса ${position} в итогах нет`);
  }

  return question;
};

describe('итоги опроса', () => {
  let cast: Cast;

  beforeEach(async () => {
    cast = await setUp();
  });

  afterEach(async () => {
    // Рассылки и сегменты — раньше опросов и сотрудников, люди — последними.
    await cleanupTestMailings();
    await cleanupTestSegments();
    await cleanupTestSurveys();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('воронка, «Где бросают» и ответы — по людям снимка рассылки', async () => {
    const results = await readMailingSurveyResults(cast.mailingId, { slice: null, completedOnly: false });

    expect(results.columns).toEqual(['total']);
    expect(results.slice).toBeNull();
    expect(results.funnel).toEqual({
      sent: [4],
      delivered: [3],
      opened: [3],
      declined: [1],
      started: [2],
      completed: [1],
      appClicked: [1],
    });
    expect(results.dropOff.map((row) => [row.position, row.people])).toEqual([
      [1, [0]],
      [2, [1]],
      [3, [0]],
      [4, [0]],
    ]);

    const single = questionAt(results.questions, 1);

    expect(single.answered).toEqual([2]);
    expect(single.skipped).toEqual([0]);
    expect(single.options.map((option) => option.people)).toEqual([[1], [0]]);
    expect(single.ownAnswer).toEqual({ people: [1], texts: [{ text: 'Своё', column: null }] });

    const multiple = questionAt(results.questions, 2);

    expect(multiple.answered).toEqual([2]);
    expect(multiple.options.map((option) => option.people)).toEqual([[1], [2]]);
    expect(multiple.ownAnswer).toBeNull();

    const scale = questionAt(results.questions, 3);

    expect(scale.scale?.values.map((entry) => [entry.value, entry.people])).toEqual([
      [1, [0]],
      [2, [0]],
      [3, [0]],
      [4, [0]],
      [5, [1]],
    ]);
    expect(scale.scale?.mean).toEqual([5]);

    expect(questionAt(results.questions, 4).texts).toEqual([{ text: '=Отлично', column: null }]);
  });

  it('«только прошедшие» сужает ответы, а воронку не трогает', async () => {
    const results = await readMailingSurveyResults(cast.mailingId, { slice: null, completedOnly: true });

    expect(results.funnel.sent).toEqual([4]);
    expect(questionAt(results.questions, 1).answered).toEqual([1]);
    expect(questionAt(results.questions, 1).ownAnswer?.people).toEqual([0]);
    expect(questionAt(results.questions, 2).options.map((option) => option.people)).toEqual([[1], [1]]);
  });

  it('срез по сегменту — две колонки, складывающиеся в итог', async () => {
    await grantPoints(cast.completer.personId, BALANCE_FROM + 1);
    const segment = await createSegment(
      {
        name: 'Тестовый срез',
        description: null,
        conditions: { ...EMPTY_SEGMENT_CONDITIONS, balanceMin: BALANCE_FROM, balanceMax: BALANCE_TO },
      },
      cast.employeeId,
      true,
    );
    trackTestSegment(segment.segmentId);

    const results = await readMailingSurveyResults(cast.mailingId, {
      slice: { kind: 'segment', segmentId: segment.segmentId },
      completedOnly: false,
    });

    expect(results.columns).toEqual(['total', 'inside', 'rest']);
    expect(results.slice).toEqual({ kind: 'segment', segmentId: segment.segmentId, name: 'Тестовый срез' });
    expect(results.funnel.sent).toEqual([4, 1, 3]);
    expect(results.funnel.completed).toEqual([1, 1, 0]);
    expect(results.funnel.declined).toEqual([1, 0, 1]);
    expect(results.dropOff.find((row) => row.position === 2)?.people).toEqual([1, 0, 1]);
    expect(questionAt(results.questions, 1).ownAnswer?.texts).toEqual([{ text: 'Своё', column: 'rest' }]);
  });

  it('срез по активности — верхние 20 % участников мира по поездкам в окне', async () => {
    await addCompletedTrips(cast.completer, 5);
    await addCompletedTrips(cast.dropper, 1);

    const results = await readMailingSurveyResults(cast.mailingId, {
      slice: { kind: 'activity' },
      completedOnly: false,
    });

    expect(results.slice).toMatchObject({ kind: 'activity', minTrips: 5 });
    expect(results.slice?.kind === 'activity' && results.slice.windowFrom < results.slice.windowTo).toBe(
      true,
    );
    expect(results.funnel.sent).toEqual([4, 1, 3]);
    expect(results.funnel.appClicked).toEqual([1, 1, 0]);
  });

  it('выгрузка — строка на человека снимка, срез колонкой', async () => {
    await addCompletedTrips(cast.completer, 2);

    const plain = await exportMailingSurveyResults(cast.mailingId, null);

    expect(plain.rows).toHaveLength(5);
    expect(plain.rows[0]).not.toContain('Срез');

    const sliced = await exportMailingSurveyResults(cast.mailingId, { kind: 'activity' });
    const [header, ...rows] = sliced.rows;

    expect(header).toEqual([
      'ID человека',
      'Позывной',
      'Язык',
      'Срез',
      'Доставлено',
      'Открыл опрос',
      'Отказался',
      'Начал',
      'Прошёл',
      'Перешёл в приложение',
      '1. Вопрос 1',
      '2. Вопрос 2',
      '3. Вопрос 3',
      '4. Вопрос 4',
    ]);
    expect(rows).toHaveLength(4);

    const rowOf = (personId: string): string[] => {
      const row = rows.find((candidate) => candidate[0] === personId);

      if (!row) {
        throw new Error(`строки ${personId} в выгрузке нет`);
      }

      return row;
    };

    const completerRow = rowOf(cast.completer.personId);

    expect(completerRow.slice(1, 4)).toEqual(['T325', 'русский', 'внутри']);
    expect(completerRow[8]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(completerRow.slice(10)).toEqual(['Вариант 1', 'Вариант 1; Вариант 2', '5', '=Отлично']);

    const dropperRow = rowOf(cast.dropper.personId);

    expect(dropperRow.slice(2, 4)).toEqual(['узбекский', 'остальные']);
    expect(dropperRow[8]).toBe('');
    expect(dropperRow.slice(10)).toEqual(['Свой вариант: Своё', 'Вариант 2', '', '']);

    const undeliveredRow = rowOf(cast.undelivered.personId);

    expect(undeliveredRow.slice(4, 10)).toEqual(['', '', '', '', '', '']);
  });

  it('у опроса — его рассылки и сводная воронка без повторов', async () => {
    const results = await readSurveyResults(cast.survey.surveyId);

    expect(results.mailings.map((mailing) => [mailing.mailingId, mailing.sent, mailing.completed])).toEqual([
      [cast.mailingId, 4, 1],
      [cast.reminderId, 2, 1],
    ]);
    expect(results.summary.columns).toEqual(['total']);
    expect(results.summary.funnel).toEqual({
      sent: [4],
      delivered: [3],
      opened: [3],
      declined: [1],
      started: [2],
      completed: [1],
      appClicked: [1],
    });
    expect(results.summary.dropOff.find((row) => row.position === 2)?.people).toEqual([1]);

    const reminder = await readMailingSurveyResults(cast.reminderId, { slice: null, completedOnly: false });

    expect(reminder.funnel).toEqual({
      sent: [2],
      delivered: [2],
      opened: [2],
      declined: [0],
      started: [2],
      completed: [1],
      appClicked: [1],
    });
  });
});
