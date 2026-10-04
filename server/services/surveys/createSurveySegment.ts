import { consola } from 'consola';
import { db } from '#server/db';
import { findSegment, insertSegment, insertSegmentMembers } from '#server/repositories/segments';
import { surveyGroupMembersSql } from '#server/repositories/surveyResults';
import { findSurvey } from '#server/repositories/surveys';
import { toSegment } from '#server/services/segments/fields';
import {
  SurveyNotFrozenForSegmentError,
  SurveyRequestInvalidError,
  SurveySegmentEmptyError,
  UnknownSurveyError,
} from '#server/services/surveys/errors';
import { formatCalendarDate, formatClockTime, formatDayMonth } from '#server/utils/parkTime';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import type { Segment } from '#shared/types/segment';
import type { SurveyGroup } from '#shared/types/surveyResults';

/**
 * Сегмент-список из итогов опроса (issue #356): кнопка в сводной воронке.
 *
 * Сегмент об опросе не знает ничего — ни ссылкой, ни условием: люди группы ложатся строками
 * `segment_members` в момент нажатия и дальше не пересчитываются, что бы ни происходило
 * с опросом. Откуда список взялся, говорит только имя и описание.
 *
 * Сегмент и его люди — одной транзакцией: пустая группа откатывает и заведённую строку
 * сегмента, и сегмента без людей не остаётся.
 *
 * Признак демо — у опроса: демо-опрос уходил только демо-рассылками, и список из него —
 * демо-сегмент. Кто вправе его завести, решила ручка — `requireDemoEditor`.
 */
const log = consola.withTag('surveys:segment');

const GROUPS: readonly SurveyGroup[] = ['not_completed', 'declined', 'completed'];

const GROUP_WORDS: Record<SurveyGroup, string> = {
  not_completed: 'не прошли',
  declined: 'отказались',
  completed: 'прошли',
};

const readSurveyGroup = (value: unknown): SurveyGroup => {
  const group = GROUPS.find((candidate) => candidate === value);

  if (group === undefined) {
    throw new SurveyRequestInvalidError('survey_group');
  }

  return group;
};

export const createSurveySegment = async (
  surveyId: string,
  requestedGroup: unknown,
  employeeId: string,
): Promise<Segment> => {
  const survey = await findSurvey(surveyId);

  if (!survey) {
    throw new UnknownSurveyError(surveyId);
  }

  if (survey.frozenAt === null) {
    throw new SurveyNotFrozenForSegmentError(surveyId);
  }

  const group = readSurveyGroup(requestedGroup);
  const title = survey.title?.trim() || 'Без названия';
  const words = GROUP_WORDS[group];
  const moment = new Date();

  const segmentId = await db.$transaction(async (transaction) => {
    const insertedId = await insertSegment(
      {
        name: `Опрос «${title}» — ${words}, ${formatDayMonth(moment)}`,
        description: `Из опроса «${title}»: ${words}, ${formatCalendarDate(moment)}, ${formatClockTime(moment)}. Список зафиксирован при создании и не пересчитывается.`,
        conditions: EMPTY_SEGMENT_CONDITIONS,
        createdById: employeeId,
        isDemo: survey.isDemo,
        kind: 'list',
      },
      transaction,
    );

    const members = await insertSegmentMembers(
      insertedId,
      surveyGroupMembersSql(surveyId, group),
      transaction,
    );

    if (members === 0) {
      throw new SurveySegmentEmptyError(surveyId, group);
    }

    return insertedId;
  });

  const row = await findSegment(segmentId);

  if (!row) {
    throw new Error(`заведённый сегмент ${segmentId} не прочитался`);
  }

  log.info('сегмент-список из итогов опроса заведён', { surveyId, group, segmentId });

  return toSegment(row);
};
