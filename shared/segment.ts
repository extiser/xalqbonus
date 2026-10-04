import type { SegmentBasis, SegmentConditions } from './types/segment';

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

/**
 * Ограничен ли отбор: условием, признаком демо (issue #212) или списком (issue #356).
 *
 * Демо-сегменту условия необязательны: признак сам сужает отбор до демо-водителей, и пустые
 * условия у него — «все демо-водители», а не весь реестр парка. Список ограничен всегда:
 * состав — его строки. Живому условному без условий по-прежнему нельзя. Правило одно на форму,
 * предпросмотр, сохранение и построитель состава; в базе его держит
 * `segments_has_condition_check`.
 */
export const isSegmentBounded = (basis: SegmentBasis): boolean =>
  basis.listSegmentId !== null || basis.isDemo || hasSegmentConditions(basis.conditions);

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
