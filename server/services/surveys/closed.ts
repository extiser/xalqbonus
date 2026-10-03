import { SurveyEndsOnPastError } from '#server/services/surveys/errors';
import { formatDayKey } from '#server/utils/parkTime';

/**
 * Закрыт ли опрос — одно правило на всё: экран водителя, плашку на главной, выбор опроса
 * в рассылке и админку (issue #348). Закрыт — значит прошёл последний день **или** опрос
 * завершён досрочно (`finished_at`).
 *
 * `ends_on` — последний день опроса: «до 10 октября» значит до 10-го 23:59 включительно,
 * и закрыт он с 00:00 одиннадцатого по Ташкенту — сутки календарные (docs/decisions.md →
 * «Сутки — с 00:00 до 00:00 по Ташкенту; у акции — свои, с 05:00»). Поэтому сравнение идёт
 * с календарным днём парка (`formatDayKey`).
 *
 * Без срока — черновик — по сроку не закрыт: закрываться ему ещё не с чего.
 */

/** То, по чему решается, закрыт ли опрос. */
export type SurveyClosingFields = {
  /** `YYYY-MM-DD`. Пусто только у черновика. */
  endsOn: string | null;
  finishedAt: Date | null;
};

/**
 * День уже прошёл: по Ташкенту сейчас следующий за ним календарный день или позже. Тем же
 * сравнением проверяется и последний день, который ставят опросу, — в прошлом его быть не может.
 */
export const isSurveyDayPast = (day: string, moment: Date): boolean => formatDayKey(moment) > day;

export const isSurveyClosed = (survey: SurveyClosingFields, moment: Date): boolean =>
  survey.finishedAt !== null || (survey.endsOn !== null && isSurveyDayPast(survey.endsOn, moment));

/**
 * Последний день, который ставят опросу, — не в прошлом (issue #348): закрыть опрос сейчас
 * можно только кнопкой «Завершить опрос». Проверяется при заведении и при правке — у черновика
 * и у замороженного.
 *
 * `current` — последний день, который уже стоит. Он сам по себе не проверяется: форма присылает
 * срок при каждом сохранении, и переименовать опрос, закрытый по сроку, иначе стало бы нельзя.
 * Пусто — не отказ: срок у черновика необязателен.
 */
export const assertSurveyEndsOnNotPast = (
  endsOn: string | null,
  current: string | null,
  moment: Date,
): void => {
  if (endsOn !== null && endsOn !== current && isSurveyDayPast(endsOn, moment)) {
    throw new SurveyEndsOnPastError(endsOn);
  }
};
