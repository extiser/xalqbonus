import { findMailing, type MailingRow } from '#server/repositories/mailings';
import { findSegment } from '#server/repositories/segments';
import { findActivityThreshold, type SurveyResultsScope } from '#server/repositories/surveyResults';
import {
  MailingSegmentUnknownError,
  MailingSurveyResultsUnavailableError,
  MailingSurveySliceInvalidError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import { toSegmentBasis } from '#server/services/segments/fields';
import { readUuid } from '#server/utils/query';
import type { SurveyResultsSlice } from '#shared/types/surveyResults';

/**
 * Круг и срез итогов опроса у рассылки (issue #325) — общие для экрана и выгрузки: файл
 * обязан строиться по тем же людям, что таблица.
 *
 * Операцией не является и поэтому лежит отдельным файлом, как `fields.ts`.
 */

/** Срез так, как его прислала ссылка. */
export type SurveySliceRequest = { kind: 'segment'; segmentId: string } | { kind: 'activity' } | null;

export type MailingSurveyResultsParams = {
  slice: SurveySliceRequest;
  /** Ответы только прошедших. */
  completedOnly: boolean;
};

/**
 * Строка запроса → параметры. Без `slice` — среза нет; `completedOnly=1` — только прошедшие.
 * Испорченное — отказ, а не молчаливый итог без среза: таблица иначе выглядела бы срезанной.
 */
export const readMailingSurveyResultsParams = (
  query: Record<string, unknown>,
): MailingSurveyResultsParams => {
  const completedOnly = query.completedOnly === '1';

  if (query.slice === undefined || query.slice === '') {
    return { slice: null, completedOnly };
  }

  if (query.slice === 'activity') {
    return { slice: { kind: 'activity' }, completedOnly };
  }

  if (query.slice !== 'segment') {
    throw new MailingSurveySliceInvalidError('slice');
  }

  const segmentId = readUuid(query.segmentId);

  if (segmentId === null) {
    throw new MailingSurveySliceInvalidError(
      query.segmentId === undefined ? 'slice' : 'segment_invalid',
    );
  }

  return { slice: { kind: 'segment', segmentId }, completedOnly };
};

export type MailingSurveyScope = {
  mailing: MailingRow;
  scope: SurveyResultsScope;
  /** Описание среза для подписи колонок. */
  slice: SurveyResultsSlice | null;
};

/**
 * Рассылка, её круг и срез. Нет рассылки — `UnknownMailingError`; нет опроса или запуска —
 * `MailingSurveyResultsUnavailableError`; сегмента среза нет — `MailingSegmentUnknownError`.
 *
 * Сегмент берётся любой — и архивный: экран предлагает только рабочие, а смотреть итоги
 * по архивному вреда нет. Мир — только свой: живой сегмент демо-водителя не возьмёт никогда,
 * и колонка «внутри» была бы пуста по построению.
 */
export const resolveMailingSurveyScope = async (
  mailingId: string,
  slice: SurveySliceRequest,
): Promise<MailingSurveyScope> => {
  const mailing = await findMailing(mailingId);

  if (!mailing) {
    throw new UnknownMailingError(mailingId);
  }

  if (mailing.surveyId === null) {
    throw new MailingSurveyResultsUnavailableError(mailingId, 'no_survey');
  }

  if (mailing.startedAt === null) {
    throw new MailingSurveyResultsUnavailableError(mailingId, 'not_launched');
  }

  const cohort = { kind: 'mailing', mailingId } as const;

  if (slice === null) {
    return { mailing, scope: { surveyId: mailing.surveyId, cohort, slice: null }, slice: null };
  }

  if (slice.kind === 'activity') {
    const threshold = await findActivityThreshold(mailing.startedAt, mailing.isDemo);

    return {
      mailing,
      scope: {
        surveyId: mailing.surveyId,
        cohort,
        slice: { kind: 'activity', launchedAt: mailing.startedAt, isDemo: mailing.isDemo },
      },
      slice: { kind: 'activity', ...threshold },
    };
  }

  const segment = await findSegment(slice.segmentId);

  if (!segment) {
    throw new MailingSegmentUnknownError(slice.segmentId);
  }

  if (segment.isDemo !== mailing.isDemo) {
    throw new MailingSurveySliceInvalidError('segment_demo_mismatch');
  }

  return {
    mailing,
    scope: {
      surveyId: mailing.surveyId,
      cohort,
      slice: { kind: 'segment', basis: toSegmentBasis(segment) },
    },
    slice: { kind: 'segment', segmentId: segment.id, name: segment.name },
  };
};
