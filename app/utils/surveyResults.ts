import { formatCalendarDate, formatNumber, formatShare, pluralize } from '~/utils/format';
import type {
  SurveyFunnelStage,
  SurveyResultsColumn,
  SurveyResultsSlice,
} from '#shared/types/surveyResults';

/**
 * Подписи итогов опроса (issue #325) — общие для экрана рассылки и экрана опроса.
 */

/** Этапы воронки по порядку, с подписями. «Отказался» и «начал» — две ветви после «открыл». */
export const SURVEY_FUNNEL_STAGES: readonly { stage: SurveyFunnelStage; label: string }[] = [
  { stage: 'sent', label: 'Отправлено' },
  { stage: 'delivered', label: 'Доставлено' },
  { stage: 'opened', label: 'Открыл опрос' },
  { stage: 'declined', label: 'Отказался' },
  { stage: 'started', label: 'Начал' },
  { stage: 'completed', label: 'Прошёл' },
  { stage: 'appClicked', label: 'Перешёл в приложение' },
];

/** Подпись колонки: итог, срез — по тому, чем он задан, — и остальные. */
export const surveyResultsColumnLabel = (
  column: SurveyResultsColumn,
  slice: SurveyResultsSlice | null,
): string => {
  if (column === 'total') {
    return 'Итог';
  }

  if (column === 'rest') {
    return 'Остальные';
  }

  if (slice?.kind === 'segment') {
    return `«${slice.name}»`;
  }

  return 'Верхние 20 % по поездкам';
};

/** Пояснение к срезу по активности — окно и порог. */
export const surveyActivitySliceNote = (slice: SurveyResultsSlice | null): string | null => {
  if (slice?.kind !== 'activity') {
    return null;
  }

  const window = `${formatCalendarDate(slice.windowFrom)}–${formatCalendarDate(slice.windowTo)}`;

  if (slice.minTrips === null) {
    return `Завершённые поездки за сутки парка ${window}: в этом окне не ездил ни один участник программы.`;
  }

  return `Завершённые поездки за сутки парка ${window}, порог — от ${formatNumber(slice.minTrips)} ${pluralize(slice.minTrips, 'поездки', 'поездок', 'поездок')} по всем участникам программы с поездками в окне.`;
};

/** Ячейка «число · доля». Доля — от своего целого той же колонки. */
export const countWithShare = (count: number, base: number): string =>
  `${formatNumber(count)} · ${formatShare(count, base)}`;
