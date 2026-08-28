/**
 * Ключи идемпотентности журнала баллов.
 *
 * Схема ключей — контракт, зафиксированный таблицей в docs/points.md. Новую схему
 * придумывать нельзя: нужна — сначала правка документа, потом код. Поэтому ключ нельзя
 * собрать строкой на месте вызова — примитив перевода принимает только `IdempotencyKey`,
 * а его выдают исключительно построители из этого файла.
 *
 * Построители заведены только на те строки таблицы, которые уже используются — ядром
 * или его тестами. Остальные появятся вместе со своей операцией: построитель, к которому
 * никто не обращается, — это схема ключа, не проверенная ни одним сценарием.
 */

declare const idempotencyKeyBrand: unique symbol;

/** Строка, собранная построителем этого файла, а не где придётся. */
export type IdempotencyKey = string & { readonly [idempotencyKeyBrand]: true };

const buildKey = (prefix: string, identifier: string): IdempotencyKey => {
  const trimmed = identifier.trim();

  // Пустой хвост даёт ключ `trip:`, одинаковый для всех поездок сразу: первая запись
  // прошла бы, а все следующие молча вернулись бы как повтор.
  if (trimmed.length === 0) {
    throw new Error(`ключ идемпотентности ${prefix}: идентификатор пуст`);
  }

  return `${prefix}:${trimmed}` as IdempotencyKey;
};

/**
 * Начисление за завершённую поездку: `trip:<trips.order_id>`.
 *
 * Идентификатор заказа Fleet API, а не наш `trips.id`. В таблице docs/points.md ключ
 * записан как `trip:<trip_id>` в терминологии старой базы, где `Trips.trip_id` и был
 * идентификатором заказа Fleet API. Смысл контракта не менялся, разошлись имена полей;
 * документ правится отдельно.
 *
 * На `trips.id` ключ строить нельзя: uuid генерится при вставке, и повторный импорт
 * поездки после удаления строки дал бы новый ключ и второе начисление — то есть ключ
 * идемпотентности перестал бы быть идемпотентным ровно там, где он нужен.
 */
export const buildTripIdempotencyKey = (tripOrderId: string): IdempotencyKey =>
  buildKey('trip', tripOrderId);

/**
 * Возврат баллов при отмене заказа товара: `order_refund:<order_id>`.
 *
 * Здесь `order_id` — заказ товара за баллы, а не заказ такси. Каталога товаров ещё нет
 * (этап 6), поэтому единственный существующий идентификатор такого заказа — номер записи
 * старой базы, он же `point_transfers.legacy_order_id`.
 */
export const buildOrderRefundIdempotencyKey = (orderId: number): IdempotencyKey => {
  if (!Number.isInteger(orderId)) {
    throw new Error(`ключ идемпотентности order_refund: идентификатор заказа не целый (${orderId})`);
  }

  return buildKey('order_refund', String(orderId));
};

/**
 * Списание баллов при заказе товара: `order_spend:<order_id>`.
 *
 * Заказ товара, как и у возврата. Каталога ещё нет; ядру этот ключ нужен, чтобы
 * опустошить счёт в сценарии нехватки баллов тем же путём, каким это будет делать обмен.
 */
export const buildOrderSpendIdempotencyKey = (orderId: number): IdempotencyKey => {
  if (!Number.isInteger(orderId)) {
    throw new Error(`ключ идемпотентности order_spend: идентификатор заказа не целый (${orderId})`);
  }

  return buildKey('order_spend', String(orderId));
};

/**
 * Ручная правка: `manual:<uuid>`.
 *
 * Идентификатор здесь не производный от чего-либо в базе, а выданный на саму правку:
 * двух одинаковых ручных правок не бывает, и повтор запроса не должен создавать вторую.
 */
export const buildManualIdempotencyKey = (operationId: string): IdempotencyKey =>
  buildKey('manual', operationId);
