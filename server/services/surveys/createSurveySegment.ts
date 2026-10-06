import { consola } from 'consola';
import { surveyGroupMembersSql } from '#server/repositories/surveyResults';
import { findSurvey } from '#server/repositories/surveys';
import { listSnapshotNote, saveListSegment } from '#server/services/segments/saveListSegment';
import {
  SurveyNotFrozenForSegmentError,
  SurveyRequestInvalidError,
  SurveySegmentEmptyError,
  UnknownSurveyError,
} from '#server/services/surveys/errors';
import { formatCalendarDate } from '#server/utils/parkTime';
import type { Segment } from '#shared/types/segment';
import type { SurveyGroup } from '#shared/types/surveyResults';

/**
 * Сегмент-список из итогов опроса (issue #356): кнопка в сводной воронке.
 *
 * Сегмент об опросе не знает ничего — ни ссылкой, ни условием: люди группы ложатся строками
 * `segment_members` в момент нажатия и дальше не пересчитываются, что бы ни происходило
 * с опросом. Откуда список взялся, говорит только имя и описание.
 *
 * Сегмент и его люди — одной транзакцией (`saveListSegment`): пустая группа откатывает
 * и заведённую строку сегмента, и сегмента без людей не остаётся. Имя и описание — по тому же
 * правилу, что у списков дашборда (issue #415): что за срез и когда собран.
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

  const { segment, members } = await saveListSegment({
    name: `Опрос «${title}»: ${words} — на ${formatCalendarDate(moment)}`,
    describe: (count) =>
      `Опросы → «${title}», сводная воронка, группа «${words}». Вошло ${count}. ${listSnapshotNote(moment)}`,
    people: surveyGroupMembersSql(surveyId, group),
    isDemo: survey.isDemo,
    createdById: employeeId,
    emptyError: () => new SurveySegmentEmptyError(surveyId, group),
  });

  log.info('сегмент-список из итогов опроса заведён', { surveyId, group, segmentId: segment.segmentId, members });

  return segment;
};
