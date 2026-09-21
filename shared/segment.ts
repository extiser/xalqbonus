import type { SegmentConditions } from './types/segment';

/**
 * Правила сегмента, общие для сервера и экрана.
 *
 * Лежат в `shared/` по той же причине, что списки доступа: форма по ним закрывает сохранение
 * и не зовёт предпросмотр, а сервер по ним же отказывает. Два списка условий — серверный
 * и клиентский — разошлись бы на первом новом условии, и разошлись бы тихо.
 */

/** Сколько строк состава на странице предпросмотра. */
export const SEGMENT_PREVIEW_LIMIT = 25;

/**
 * Задано ли хоть одно условие.
 *
 * Сегмент без условий — это весь реестр парка под видом среза, и однажды по нему уйдёт
 * рассылка на двадцать пять тысяч человек. Такой не сохраняется и состава не отдаёт.
 */
export const hasSegmentConditions = (conditions: SegmentConditions): boolean =>
  Object.values(conditions).some((value) => value !== null);

/** Пустые условия — стартовое значение формы нового сегмента. */
export const EMPTY_SEGMENT_CONDITIONS: SegmentConditions = {
  daysSinceTripMin: null,
  daysSinceTripMax: null,
  programMember: null,
  telegramLinked: null,
  balanceMin: null,
  balanceMax: null,
};

export const SEGMENT_EMPTY_CONDITIONS_TEXT =
  'Задайте хотя бы одно условие: сегмент без условий — это весь реестр парка.';
