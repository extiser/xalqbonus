import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { createMailing } from '#server/services/mailings/createMailing';
import { copySurvey } from '#server/services/surveys/copySurvey';
import { createSurvey } from '#server/services/surveys/createSurvey';
import { deleteSurveyDraft } from '#server/services/surveys/deleteSurveyDraft';
import {
  SurveyAttachedError,
  SurveyFrozenError,
  SurveyFrozenFieldRequiredError,
  UnknownSurveyError,
} from '#server/services/surveys/errors';
import type { SurveyContent, SurveyRequest } from '#server/services/surveys/fields';
import { readSurvey, readSurveyList } from '#server/services/surveys/readSurvey';
import { updateSurvey } from '#server/services/surveys/updateSurvey';
import type { Survey } from '#shared/types/survey';
import { cleanupTestData, disconnectDatabase } from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { cleanupTestMailings, trackTestMailing } from '../support/mailings';
import { disconnectQueues } from '../support/queues';
import { cleanupTestSurveys, createFrozenTestSurvey, trackTestSurvey } from '../support/surveys';

/**
 * Конструктор опроса: заведение, правка черновика и замороженного, копия, удаление, список.
 *
 * Все запросы `server/repositories/surveys.ts` сырые, и колонки `allow_own_answer`
 * и `exclusive` в них перечислены руками: миграция, переименовавшая колонку, сломает
 * конструктор молча — типы расхождения со схемой не ловят (docs/infra.md → «Тесты», третье
 * исключение). Тест гоняет их через сервисы — тем путём, которым их зовут ручки.
 */

/** Заголовок копии опроса: та же пометка, что у рассылки (`copyMailingTitle`). */
const COPY_TITLE = /^Тестовый опрос — копия \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/;

const TEXTS = {
  introRu: 'Вступление',
  introUz: 'Kirish',
  finishRu: 'Финал',
  finishUz: 'Yakun',
  declineButtonRu: 'Закрыть',
  declineButtonUz: 'Yopish',
  appButtonRu: 'Открыть приложение',
  appButtonUz: 'Ilovani ochish',
};

/** Вопросы всех четырёх типов: «Свой вариант» у обоих выборов, исключающий — у `multiple`. */
const ALL_TYPES_CONTENT: SurveyContent = {
  ...TEXTS,
  points: 15,
  questions: [
    {
      type: 'single',
      textRu: 'Как часто вы работаете?',
      textUz: 'Qanchalik tez-tez ishlaysiz?',
      required: true,
      allowOwnAnswer: true,
      options: [
        { textRu: 'Каждый день', textUz: 'Har kuni', exclusive: false },
        { textRu: 'По выходным', textUz: 'Dam olish kunlari', exclusive: false },
      ],
    },
    {
      type: 'multiple',
      textRu: 'Что улучшить?',
      textUz: 'Nimani yaxshilash kerak?',
      required: false,
      allowOwnAnswer: true,
      options: [
        { textRu: 'Каталог', textUz: 'Katalog', exclusive: false },
        { textRu: 'Офисы', textUz: 'Ofislar', exclusive: false },
        { textRu: 'Ничего', textUz: 'Hech narsa', exclusive: true },
      ],
    },
    {
      type: 'scale',
      textRu: 'Оцените программу',
      textUz: 'Dasturni baholang',
      required: true,
      allowOwnAnswer: false,
      options: [],
    },
    {
      type: 'text',
      textRu: 'Что ещё?',
      textUz: 'Yana nima?',
      required: false,
      allowOwnAnswer: false,
      options: [],
    },
  ],
};

const SETTINGS = { title: 'Тестовый опрос', endsOn: '2099-12-31' };

/** Вопросы опроса без идентификаторов — в той форме, в которой их присылает форма. */
const questionShape = (survey: Survey): SurveyContent['questions'] =>
  survey.questions.map(({ questionId: _questionId, options, ...question }) => ({
    ...question,
    options: options.map(({ optionId: _optionId, ...option }) => option),
  }));

const createDraft = async (createdById: string, request: SurveyRequest): Promise<Survey> => {
  const survey = await createSurvey(request, createdById, false);

  trackTestSurvey(survey.surveyId);

  return survey;
};

/** Замороженный опрос с обоими признаками — такой, какой уходит рассылкой. */
const createFrozen = async (createdById: string): Promise<string> => {
  const { surveyId } = await createFrozenTestSurvey({
    createdById,
    points: 20,
    endsOn: '2099-12-31',
    questions: [
      { type: 'single', required: true, allowOwnAnswer: true, options: [{}, {}] },
      { type: 'multiple', required: false, allowOwnAnswer: true, options: [{}, { exclusive: true }] },
      { type: 'scale', required: true },
      { type: 'text', required: false },
    ],
  });

  return surveyId;
};

describe('конструктор опроса', () => {
  afterEach(async () => {
    // Рассылка ссылается на опрос, опрос — на автора: рассылки первыми, сотрудники последними.
    await cleanupTestMailings();
    await cleanupTestSurveys();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('заведение с вопросами всех типов читается тем же, вместе с обоими признаками', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });

    const created = await createDraft(employeeId, { settings: SETTINGS, content: ALL_TYPES_CONTENT });

    expect(created).toEqual(
      expect.objectContaining({
        ...TEXTS,
        title: SETTINGS.title,
        endsOn: SETTINGS.endsOn,
        points: ALL_TYPES_CONTENT.points,
        frozenAt: null,
        closed: false,
        isDemo: false,
        createdByName: 'Тестовый Сотрудник',
      }),
    );
    expect(questionShape(created)).toEqual(ALL_TYPES_CONTENT.questions);
    expect(await readSurvey(created.surveyId)).toEqual(created);

    // Пустой черновик — так его заводит форма первым набранным символом.
    const empty = await createDraft(employeeId, {
      settings: { title: null, endsOn: null },
      content: null,
    });

    expect(empty).toEqual(
      expect.objectContaining({ title: null, endsOn: null, points: 0, introRu: null, questions: [] }),
    );
  });

  it('правка черновика заменяет вопросы и варианты, признаки сохраняются', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const draft = await createDraft(employeeId, { settings: SETTINGS, content: ALL_TYPES_CONTENT });

    const replaced: SurveyContent = {
      ...TEXTS,
      introRu: 'Новое вступление',
      points: 30,
      questions: [
        {
          type: 'multiple',
          textRu: 'Где заправляетесь?',
          textUz: 'Qayerda yoqilg‘i quyasiz?',
          required: true,
          allowOwnAnswer: true,
          options: [
            { textRu: 'Ничего из этого', textUz: 'Hech biri', exclusive: true },
            { textRu: 'На метане', textUz: 'Metanda', exclusive: false },
          ],
        },
        {
          type: 'single',
          textRu: 'Удобно ли?',
          textUz: 'Qulaymi?',
          required: false,
          allowOwnAnswer: false,
          options: [
            { textRu: 'Да', textUz: 'Ha', exclusive: false },
            { textRu: 'Нет', textUz: 'Yo‘q', exclusive: false },
          ],
        },
      ],
    };

    const updated = await updateSurvey(draft.surveyId, {
      settings: { title: 'Переименованный опрос', endsOn: '2099-06-30' },
      content: replaced,
    });

    expect(updated).toEqual(
      expect.objectContaining({
        title: 'Переименованный опрос',
        endsOn: '2099-06-30',
        introRu: 'Новое вступление',
        points: 30,
        frozenAt: null,
      }),
    );
    expect(questionShape(updated)).toEqual(replaced.questions);
    expect(await readSurvey(draft.surveyId)).toEqual(updated);

    // Прежние вопросы удалены, а не дописаны рядом.
    const previousIds = draft.questions.map((question) => question.questionId);

    expect(updated.questions.some((question) => previousIds.includes(question.questionId))).toBe(false);
  });

  it('у замороженного правятся название и срок, содержимое — отказ', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const surveyId = await createFrozen(employeeId);
    const before = await readSurvey(surveyId);

    const updated = await updateSurvey(surveyId, {
      settings: { title: 'Продлённый опрос', endsOn: '2100-01-31' },
      content: null,
    });

    expect(updated).toEqual({
      ...before,
      title: 'Продлённый опрос',
      endsOn: '2100-01-31',
      updatedAt: updated.updatedAt,
    });

    await expect(
      updateSurvey(surveyId, { settings: SETTINGS, content: ALL_TYPES_CONTENT }),
    ).rejects.toBeInstanceOf(SurveyFrozenError);
    await expect(
      updateSurvey(surveyId, { settings: { title: null, endsOn: '2100-01-31' }, content: null }),
    ).rejects.toBeInstanceOf(SurveyFrozenFieldRequiredError);

    // Отказ ничего не записал: ни содержимого, ни названия.
    expect(await readSurvey(surveyId)).toEqual(updated);
  });

  it('копия замороженного — черновик со всеми вопросами, вариантами и обоими признаками', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const surveyId = await createFrozen(employeeId);
    const source = await readSurvey(surveyId);

    const copy = await copySurvey(surveyId, employeeId);

    trackTestSurvey(copy.surveyId);

    expect(copy.surveyId).not.toBe(surveyId);
    expect(copy).toEqual(
      expect.objectContaining({
        ...TEXTS,
        title: expect.stringMatching(COPY_TITLE),
        endsOn: source.endsOn,
        points: source.points,
        frozenAt: null,
        isDemo: source.isDemo,
      }),
    );
    expect(questionShape(copy)).toEqual(questionShape(source));
    expect(questionShape(copy).flatMap((question) => question.options).some((option) => option.exclusive)).toBe(
      true,
    );
    expect(await readSurvey(copy.surveyId)).toEqual(copy);

    // Вопросы копии — новые строки, а не ссылки на вопросы оригинала.
    const sourceIds = source.questions.map((question) => question.questionId);

    expect(copy.questions.some((question) => sourceIds.includes(question.questionId))).toBe(false);
  });

  it('черновик удаляется, а прикреплённый к рассылке и замороженный — нет', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });

    const draft = await createDraft(employeeId, { settings: SETTINGS, content: ALL_TYPES_CONTENT });

    await deleteSurveyDraft(draft.surveyId);
    await expect(readSurvey(draft.surveyId)).rejects.toBeInstanceOf(UnknownSurveyError);
    await expect(deleteSurveyDraft(draft.surveyId)).rejects.toBeInstanceOf(UnknownSurveyError);

    const attached = await createDraft(employeeId, { settings: SETTINGS, content: ALL_TYPES_CONTENT });
    const mailing = await createMailing(
      { title: null, textRu: null, textUz: null, segmentId: null, surveyId: attached.surveyId },
      employeeId,
      false,
    );

    trackTestMailing(mailing.mailingId);

    await expect(deleteSurveyDraft(attached.surveyId)).rejects.toBeInstanceOf(SurveyAttachedError);
    expect(await readSurvey(attached.surveyId)).toEqual(attached);

    const frozenId = await createFrozen(employeeId);

    await expect(deleteSurveyDraft(frozenId)).rejects.toBeInstanceOf(SurveyFrozenError);
  });

  it('список отдаёт опросы с числом вопросов', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });

    const full = await createDraft(employeeId, { settings: SETTINGS, content: ALL_TYPES_CONTENT });
    const empty = await createDraft(employeeId, { settings: { title: null, endsOn: null }, content: null });
    const frozenId = await createFrozen(employeeId);

    const list = await readSurveyList();
    const find = (surveyId: string) => list.find((item) => item.surveyId === surveyId);

    expect(find(full.surveyId)).toEqual({
      surveyId: full.surveyId,
      title: SETTINGS.title,
      questionCount: ALL_TYPES_CONTENT.questions.length,
      points: ALL_TYPES_CONTENT.points,
      endsOn: SETTINGS.endsOn,
      frozenAt: null,
      closed: false,
      finishedAt: null,
      isDemo: false,
      createdByName: 'Тестовый Сотрудник',
      createdAt: full.createdAt,
    });
    expect(find(empty.surveyId)).toEqual(expect.objectContaining({ title: null, questionCount: 0 }));
    expect(find(frozenId)).toEqual(
      expect.objectContaining({ questionCount: 4, frozenAt: expect.any(String) }),
    );
  });
});
