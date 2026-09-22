import type { ChestThresholds } from '#server/repositories/campaigns';
import {
  DAY_GOAL_TRIPS,
  REQUIRED_DAYS,
  THREE_DAYS_REQUIRED,
} from '#server/services/campaigns/weekProgress';

/**
 * Две точки после конца окна (docs/decisions.md → «Сундук открывается сразу, как заработан»).
 *
 * Отсчёт от метки конца окна — 05:00 суток, следующих за последним днём. Часами, а не временем
 * суток: перевода часов в Узбекистане нет, и «плюс шестнадцать часов» — всегда 21:00.
 */

/**
 * Итог окна — в 09:00. Четыре часа — буфер на опоздавшие из Fleet API поездки (docs/decisions.md →
 * «Сутки — с 05:00 до 05:00 по Ташкенту»). Замер отставания — медиана 82 с, максимум 279 с — говорит,
 * что его хватает с запасом.
 */
export const OUTCOME_BUFFER_HOURS = 4;

/**
 * Вскрытие неоткрытых сундуков — в 21:00 того же дня. До него живёт экран акции у вступившего:
 * между итогом и вскрытием водитель открывает оставшееся сам.
 */
export const CHEST_REVEAL_HOURS = 16;

/** Пороги лестницы для сырого SQL — те же числа, что у экрана и открытия. */
export const CHEST_THRESHOLDS: ChestThresholds = {
  dayGoalTrips: DAY_GOAL_TRIPS,
  threeDaysRequired: THREE_DAYS_REQUIRED,
  weekRequired: REQUIRED_DAYS,
};
