import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import { countSurveyGroups, surveyGroupMembersSql } from '#server/repositories/surveyResults';
import { createCampaign } from '#server/services/campaigns/createCampaign';
import { launchCampaign } from '#server/services/campaigns/launchCampaign';
import { grantGift } from '#server/services/gifts/grantGift';
import { createMailing } from '#server/services/mailings/createMailing';
import { launchMailing } from '#server/services/mailings/launchMailing';
import { readMailingAudience } from '#server/services/mailings/readMailingAudience';
import { InvalidSegmentFieldsError } from '#server/services/segments/errors';
import { previewSavedSegment } from '#server/services/segments/previewSegment';
import { readSegmentPersonIds } from '#server/services/segments/readSegmentPersonIds';
import { setSegmentArchived } from '#server/services/segments/setSegmentArchived';
import { updateSegment } from '#server/services/segments/updateSegment';
import { createSurveySegment } from '#server/services/surveys/createSurveySegment';
import {
  SurveyNotFrozenForSegmentError,
  SurveyRequestInvalidError,
  SurveySegmentEmptyError,
} from '#server/services/surveys/errors';
import { readSurveyResults } from '#server/services/surveys/readSurveyResults';
import { CHECK_VIOLATION, isConstraintViolation } from '#server/utils/postgresErrors';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import type { Segment } from '#shared/types/segment';
import type { SurveyGroup } from '#shared/types/surveyResults';
import { cleanupTestCampaigns, fillTestPrizes, readParticipants, trackTestCampaign } from '../support/campaigns';
import { cleanupTestData, createTestOffice, createTestPerson, disconnectDatabase } from '../support/database';
import { cleanupTestEmployees, createTestEmployee, nextTestTelegramUserId } from '../support/employees';
import { cleanupTestMailings, readTestRecipients, trackTestMailing } from '../support/mailings';
import { disconnectQueues } from '../support/queues';
import { cleanupTestSegments, trackTestSegment } from '../support/segments';
import { cleanupTestSurveys, createFrozenTestSurvey, createTestSurvey } from '../support/surveys';

/**
 * Сегмент-список из итогов опроса (issue #356): группы сводного круга, снимок в список
 * и список у потребителей — рассылки, акции, подарка.
 *
 * Запросы сырые и читают чужие таблицы — `mailing_recipients`, `mailings`, `survey_responses`,
 * `segment_members` и всё, что читает построитель сегментов. Миграция в любой из них ломает
 * список молча: типы расхождения со схемой не ловят (docs/infra.md → «Тесты», третье
 * исключение). Тест гоняет их через сервисы — тем путём, которым их зовут ручки.
 *
 * Снимок рассылок опроса и метки прохождения пишутся фикстурой, мимо запуска и экрана опроса:
 * под тестом группы и список, а запись покрыта своими тестами.
 */

type Recipient = { personId: string; delivered: boolean };

/** Запущенная рассылка опроса со снимком: доставленным — исход `sent`, остальным — `pending`. */
const createLaunchedMailing = async (
  createdById: string,
  surveyId: string,
  isDemo: boolean,
  recipients: Recipient[],
): Promise<string> => {
  const startedAt = new Date(Date.now() - 60 * 60 * 1_000);
  const mailing = await db.mailing.create({
    data: {
      title: 'Тестовая рассылка с опросом',
      textRu: 'Привет',
      textUz: 'Salom',
      status: 'finished',
      startedAt,
      finishedAt: startedAt,
      isDemo,
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

/**
 * Привязки Telegram — своими, а не `linkTestDriver`: ту убирает уборка учёток, а она идёт
 * после сегментов, сегменты — после раздачи подарка, раздача — с людьми, а люди — после
 * привязок. Свои привязки уходят первыми и круг разрывают.
 */
const createdLinkIds = new Set<string>();

const linkDriver = async (personId: string): Promise<void> => {
  const link = await db.telegramLink.create({
    data: { personId, telegramChatId: nextTestTelegramUserId(), confirmedBy: 'phone_auto' },
  });

  createdLinkIds.add(link.id);
};

const cleanupLinks = async (): Promise<void> => {
  const linkIds = [...createdLinkIds];
  createdLinkIds.clear();

  await db.telegramLink.deleteMany({ where: { id: { in: linkIds } } });
};

const createSurvey = async (createdById: string, isDemo: boolean): Promise<string> => {
  const { surveyId } = await createFrozenTestSurvey({
    createdById,
    points: 0,
    endsOn: '2099-12-31',
    questions: [{ type: 'text', required: false }],
  });

  await db.survey.update({ where: { id: surveyId }, data: { isDemo } });

  return surveyId;
};

const createParticipant = async (isDemo = false): Promise<string> => {
  const { personId } = await createTestPerson({ inProgram: true });

  if (isDemo) {
    await db.person.update({ where: { id: personId }, data: { isDemo: true } });
  }

  return personId;
};

const markResponse = async (
  surveyId: string,
  personId: string,
  marks: { declined?: boolean; started?: boolean; completed?: boolean },
): Promise<void> => {
  const moment = new Date();

  await db.surveyResponse.upsert({
    where: { surveyId_personId: { surveyId, personId } },
    create: {
      surveyId,
      personId,
      declinedAt: marks.declined ? moment : null,
      startedAt: marks.started || marks.completed ? moment : null,
      completedAt: marks.completed ? moment : null,
    },
    update: {
      ...(marks.declined ? { declinedAt: moment } : {}),
      ...(marks.started || marks.completed ? { startedAt: moment } : {}),
      ...(marks.completed ? { completedAt: moment } : {}),
    },
  });
};

const groupMembers = async (surveyId: string, group: SurveyGroup): Promise<string[]> => {
  const rows = await db.$queryRaw<{ personId: string }[]>(
    Prisma.sql`SELECT member."personId" FROM (${surveyGroupMembersSql(surveyId, group)}) AS member`,
  );

  return rows.map((row) => row.personId).sort();
};

const listedPersonIds = async (segmentId: string): Promise<string[]> => {
  const rows = await db.segmentMember.findMany({ where: { segmentId }, select: { personId: true } });

  return rows.map((row) => row.personId).sort();
};

const createListSegment = async (
  surveyId: string,
  group: SurveyGroup,
  employeeId: string,
): Promise<Segment> => {
  const segment = await createSurveySegment(surveyId, group, employeeId);

  trackTestSegment(segment.segmentId);

  return segment;
};

const countSegmentsBy = (employeeId: string): Promise<number> =>
  db.segment.count({ where: { createdById: employeeId } });

const sorted = (personIds: string[]): string[] => [...personIds].sort();

/** Опрос двумя рассылками и люди во всех положениях. */
const setUpGroups = async (employeeId: string) => {
  const surveyId = await createSurvey(employeeId, false);

  const twice = await createParticipant();
  const undelivered = await createParticipant();
  const dropper = await createParticipant();
  const decliner = await createParticipant();
  const declinedThenCompleted = await createParticipant();
  const completer = await createParticipant();

  await createLaunchedMailing(employeeId, surveyId, false, [
    { personId: twice, delivered: true },
    { personId: undelivered, delivered: false },
    { personId: dropper, delivered: true },
    { personId: decliner, delivered: true },
    { personId: declinedThenCompleted, delivered: true },
    { personId: completer, delivered: true },
  ]);
  await createLaunchedMailing(employeeId, surveyId, false, [{ personId: twice, delivered: true }]);

  await markResponse(surveyId, undelivered, { completed: true });
  await markResponse(surveyId, dropper, { started: true });
  await markResponse(surveyId, decliner, { declined: true });
  await markResponse(surveyId, declinedThenCompleted, { declined: true });
  await markResponse(surveyId, declinedThenCompleted, { completed: true });
  await markResponse(surveyId, completer, { completed: true });

  return { surveyId, twice, undelivered, dropper, decliner, declinedThenCompleted, completer };
};

describe('сегмент-список из итогов опроса', () => {
  afterEach(async () => {
    // Рассылки, акции и раздачи подарков ссылаются на сегмент: раздачи уходят с людьми
    // (`cleanupTestData`, она же снимает строки списков), сегменты — после них, учётки последними.
    await cleanupTestMailings();
    await cleanupTestCampaigns();
    await cleanupLinks();
    await cleanupTestData();
    await cleanupTestSegments();
    await cleanupTestSurveys();
    await cleanupTestEmployees();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('группы: сводный круг, только доставленные, прохождение важнее отказа', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const cast = await setUpGroups(employeeId);

    const notCompleted = await groupMembers(cast.surveyId, 'not_completed');
    const declined = await groupMembers(cast.surveyId, 'declined');
    const completed = await groupMembers(cast.surveyId, 'completed');

    // Получивший две рассылки — один раз; открывший и бросивший — не прошёл.
    expect(notCompleted).toEqual(sorted([cast.twice, cast.dropper]));
    // Отказавшийся и потом прошедший — в прошедших, не в отказавшихся.
    expect(declined).toEqual([cast.decliner]);
    expect(completed).toEqual(sorted([cast.declinedThenCompleted, cast.completer]));

    // Недоставленный — ни в одной группе, даже пройдя опрос.
    expect([...notCompleted, ...declined, ...completed]).not.toContain(cast.undelivered);

    const counts = await countSurveyGroups(cast.surveyId);

    expect(counts).toEqual({
      not_completed: notCompleted.length,
      declined: declined.length,
      completed: completed.length,
    });
    expect((await readSurveyResults(cast.surveyId)).groups).toEqual(counts);
  });

  it('список фиксирует группу и не меняется, когда опрос проходят после нажатия', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const cast = await setUpGroups(employeeId);

    const segment = await createListSegment(cast.surveyId, 'not_completed', employeeId);

    expect(segment).toMatchObject({
      kind: 'list',
      isDemo: false,
      conditions: EMPTY_SEGMENT_CONDITIONS,
      archivedAt: null,
    });
    expect(segment.name).toMatch(/^Опрос «Тестовый опрос» — не прошли, \d{2}\.\d{2}$/);
    expect(segment.description).toMatch(
      /^Из опроса «Тестовый опрос»: не прошли, \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}\. Список зафиксирован при создании и не пересчитывается\.$/,
    );

    const group = await groupMembers(cast.surveyId, 'not_completed');

    expect(await listedPersonIds(segment.segmentId)).toEqual(group);
    expect(sorted(await readSegmentPersonIds(segment.segmentId))).toEqual(group);

    await markResponse(cast.surveyId, cast.dropper, { completed: true });

    expect(await groupMembers(cast.surveyId, 'not_completed')).toEqual([cast.twice]);
    expect(await listedPersonIds(segment.segmentId)).toEqual(group);
    expect((await previewSavedSegment(segment.segmentId, 0)).total).toBe(group.length);
  });

  it('пустая группа, черновик опроса и чужая группа — отказ, сегмента нет', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const surveyId = await createSurvey(employeeId, false);
    const personId = await createParticipant();

    await createLaunchedMailing(employeeId, surveyId, false, [{ personId, delivered: true }]);

    await expect(createSurveySegment(surveyId, 'declined', employeeId)).rejects.toBeInstanceOf(
      SurveySegmentEmptyError,
    );
    await expect(createSurveySegment(surveyId, 'everyone', employeeId)).rejects.toBeInstanceOf(
      SurveyRequestInvalidError,
    );

    const draftId = await createTestSurvey({ createdById: employeeId, points: 0 });

    await expect(createSurveySegment(draftId, 'not_completed', employeeId)).rejects.toBeInstanceOf(
      SurveyNotFrozenForSegmentError,
    );

    // Пустая группа откатила и строку сегмента.
    expect(await countSegmentsBy(employeeId)).toBe(0);
  });

  it('демо-опрос даёт демо-сегмент; спрятанный и чужого мира водитель из состава выпадает', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });

    const demoSurveyId = await createSurvey(employeeId, true);
    const demoKept = await createParticipant(true);
    const demoHidden = await createParticipant(true);

    await createLaunchedMailing(employeeId, demoSurveyId, true, [
      { personId: demoKept, delivered: true },
      { personId: demoHidden, delivered: true },
    ]);

    const demoSegment = await createListSegment(demoSurveyId, 'not_completed', employeeId);

    expect(demoSegment.isDemo).toBe(true);
    expect(sorted(await readSegmentPersonIds(demoSegment.segmentId))).toEqual(sorted([demoKept, demoHidden]));

    // Спрятанный после заведения списка (issue #252) из состава выпадает, строка остаётся.
    await db.person.update({ where: { id: demoHidden }, data: { demoHiddenAt: new Date() } });

    expect(await readSegmentPersonIds(demoSegment.segmentId)).toEqual([demoKept]);
    expect(await listedPersonIds(demoSegment.segmentId)).toEqual(sorted([demoKept, demoHidden]));

    // Живая рассылка доходит и до демо-водителя, но живой список его не отдаёт.
    const liveSurveyId = await createSurvey(employeeId, false);
    const live = await createParticipant();
    const demoInLive = await createParticipant(true);

    await createLaunchedMailing(employeeId, liveSurveyId, false, [
      { personId: live, delivered: true },
      { personId: demoInLive, delivered: true },
    ]);

    const liveSegment = await createListSegment(liveSurveyId, 'not_completed', employeeId);

    expect(liveSegment.isDemo).toBe(false);
    expect(await readSegmentPersonIds(liveSegment.segmentId)).toEqual([live]);
  });

  it('рассылка, акция и подарок берут ровно состав списка', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const surveyId = await createSurvey(employeeId, false);

    const linkedFirst = await createParticipant();
    const linkedSecond = await createParticipant();
    const unlinked = await createParticipant();

    await linkDriver(linkedFirst);
    await linkDriver(linkedSecond);

    await createLaunchedMailing(employeeId, surveyId, false, [
      { personId: linkedFirst, delivered: true },
      { personId: linkedSecond, delivered: true },
      { personId: unlinked, delivered: true },
    ]);

    const segment = await createListSegment(surveyId, 'not_completed', employeeId);
    const members = sorted([linkedFirst, linkedSecond, unlinked]);

    // Рассылка — пересечение с аудиторией: без привязки сообщение не уходит.
    expect(await readMailingAudience(false, segment.segmentId)).toEqual({
      total: 2,
      notificationsDisabled: 0,
    });

    const mailing = await createMailing(
      { title: 'Напоминание', textRu: 'Привет', textUz: 'Salom', segmentId: segment.segmentId, surveyId: null },
      employeeId,
      false,
    );

    trackTestMailing(mailing.mailingId);
    await launchMailing(mailing.mailingId);

    const recipients = await readTestRecipients(mailing.mailingId, members);

    expect(recipients.map((recipient) => recipient.personId)).toEqual(sorted([linkedFirst, linkedSecond]));

    // Акция — весь состав.
    const officeId = await createTestOffice();
    const campaign = await createCampaign(
      {
        title: 'Акция по списку — тест',
        slug: `test-list-${Date.now()}`,
        segmentId: segment.segmentId,
        startsOn: '2099-10-01',
        endsOn: '2099-10-07',
        splitEnabled: false,
        officeId,
        rewardLifetimeDays: 7,
      },
      employeeId,
      false,
    );

    trackTestCampaign(campaign.campaign.campaignId);
    await fillTestPrizes(campaign.campaign.campaignId);
    await launchCampaign(campaign.campaign.campaignId);

    const participants = await readParticipants(campaign.campaign.campaignId);

    expect(participants.map((participant) => participant.personId)).toEqual(members);

    // Подарок — весь состав: все трое участники программы.
    const granted = await grantGift({
      recipient: { kind: 'segment', segmentId: segment.segmentId },
      points: 100,
      reasonRu: 'за ответы',
      reasonUz: 'javoblar uchun',
      messageRu: '',
      messageUz: '',
      coverRu: null,
      coverUz: null,
      sendNow: false,
      untilDate: '2099-01-01',
      employeeId,
    });

    expect(granted).toMatchObject({ recipients: 3, skipped: 0 });
  });

  it('у списка правятся имя и описание, условие — отказ', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const surveyId = await createSurvey(employeeId, false);
    const personId = await createParticipant();

    await createLaunchedMailing(employeeId, surveyId, false, [{ personId, delivered: true }]);

    const segment = await createListSegment(surveyId, 'not_completed', employeeId);

    const failure = await updateSegment(segment.segmentId, {
      name: 'Не прошли',
      description: null,
      conditions: { ...EMPTY_SEGMENT_CONDITIONS, balanceMin: 0 },
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(InvalidSegmentFieldsError);
    expect((failure as InvalidSegmentFieldsError).problem).toBe('list_conditions_locked');

    const updated = await updateSegment(segment.segmentId, {
      name: 'Не прошли — напоминание',
      description: 'Позвать ещё раз',
      conditions: EMPTY_SEGMENT_CONDITIONS,
    });

    expect(updated).toMatchObject({
      name: 'Не прошли — напоминание',
      description: 'Позвать ещё раз',
      kind: 'list',
      conditions: EMPTY_SEGMENT_CONDITIONS,
    });
    expect(await readSegmentPersonIds(segment.segmentId)).toEqual([personId]);

    // Архив и возврат — как у условного.
    expect((await setSegmentArchived(segment.segmentId, true)).archivedAt).not.toBeNull();
    expect((await setSegmentArchived(segment.segmentId, false)).archivedAt).toBeNull();
  });

  it('база не пускает список с условием и живой условный без условий', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });

    const listWithCondition = await db.$executeRaw`
      INSERT INTO xb.segments ("name", "kind", "balance_min", "created_by_id")
      VALUES ('Список с условием', 'list'::xb.segment_kind, 0, ${employeeId}::uuid)
    `.catch((error: unknown) => error);

    expect(
      isConstraintViolation(listWithCondition, CHECK_VIOLATION, 'segments_list_without_conditions_check'),
    ).toBe(true);

    const liveWithoutConditions = await db.$executeRaw`
      INSERT INTO xb.segments ("name", "kind", "created_by_id")
      VALUES ('Весь реестр', 'conditions'::xb.segment_kind, ${employeeId}::uuid)
    `.catch((error: unknown) => error);

    expect(
      isConstraintViolation(liveWithoutConditions, CHECK_VIOLATION, 'segments_has_condition_check'),
    ).toBe(true);
  });
});
