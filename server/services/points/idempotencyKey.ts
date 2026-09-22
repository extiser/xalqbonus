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
 * Идентификатор заказа Fleet API, а не наш `trips.id`.
 *
 * На `trips.id` ключ строить нельзя: uuid генерится при вставке, и повторный импорт
 * поездки после удаления строки дал бы новый ключ и второе начисление — то есть ключ
 * идемпотентности перестал бы быть идемпотентным ровно там, где он нужен.
 */
export const buildTripIdempotencyKey = (tripOrderId: string): IdempotencyKey =>
  buildKey('trip', tripOrderId);

/**
 * Перенос баланса при запуске журнала: `opening:<persons.id>`.
 *
 * Ключ строится от человека, а не от записи старой базы, и это не мелочь: у двенадцати
 * склеенных пар записей две, а человек и баланс — один. Ключ от записи дал бы два
 * `opening` на один счёт, то есть удвоил бы перенесённый баланс ровно там, где склейка
 * и нужна (docs/points.md, _reference/legacy/public-schema-2026-08-27.md §7.2).
 */
export const buildOpeningIdempotencyKey = (personId: string): IdempotencyKey =>
  buildKey('opening', personId);

/**
 * Приветственный бонус за первые пять завершённых поездок: `welcome:<persons.id>`.
 *
 * Ключ строится от человека, а не от поездки, на которой порог сошёлся: бонус случается
 * с человеком один раз за всё время, и пятая поездка — только момент, когда это стало
 * видно. Ключ от поездки выдал бы второй бонус тому, у кого пятая поездка переоформилась
 * в парке на другой профиль, и был бы бессмыслен при склейке двойников.
 */
export const buildWelcomeIdempotencyKey = (personId: string): IdempotencyKey =>
  buildKey('welcome', personId);

/**
 * Возврат баллов при отмене заказа товара: `order_refund:<orders.id>`.
 *
 * Здесь «заказ» — заказ товара за баллы, наша собственная сущность, а не заказ такси
 * из Fleet API (docs/points.md).
 *
 * Ключ строится от `orders.id`, а не от сквозного номера `orders.number`: uuid рождается
 * при вставке заказа и живёт с ним, тогда как номер — для людей, «№ 1042» на стойке
 * и в истории водителя. Отмена водителем, сотрудником и просрочкой даёт один и тот же
 * ключ, поэтому повторная отмена не возвращает баллы дважды, кто бы её ни позвал.
 */
export const buildOrderRefundIdempotencyKey = (orderId: string): IdempotencyKey =>
  buildKey('order_refund', orderId);

/**
 * Списание баллов при заказе товара: `order_spend:<orders.id>`.
 *
 * Заказ товара, как и у возврата. Баллы списываются в момент оформления, а не выдачи,
 * одной транзакцией с резервом остатка (docs/decisions.md → «Каталог: заказ — это касса,
 * остаток живёт по офисам»), поэтому ключ известен раньше самой строки заказа:
 * идентификатор выдаётся оформлением до вставки.
 */
export const buildOrderSpendIdempotencyKey = (orderId: string): IdempotencyKey =>
  buildKey('order_spend', orderId);

/**
 * Ручная правка: `manual:<uuid>`.
 *
 * Идентификатор здесь не производный от чего-либо в базе, а выданный на саму правку:
 * двух одинаковых ручных правок не бывает, и повтор запроса не должен создавать вторую.
 */
export const buildManualIdempotencyKey = (operationId: string): IdempotencyKey =>
  buildKey('manual', operationId);

/** Сундук акции в хвосте ключа: сундук дня — с номером дня окна. */
export type CampaignChestRef =
  | { kind: 'day'; dayNumber: number }
  | { kind: 'three_days' }
  | { kind: 'week' };

const campaignChestTail = (chest: CampaignChestRef): string => {
  switch (chest.kind) {
    case 'day': {
      // Номер вне окна дал бы ключ, которого нет в таблице docs/points.md.
      if (!Number.isInteger(chest.dayNumber) || chest.dayNumber < 1) {
        throw new Error(`ключ сундука акции: день ${chest.dayNumber} — не день окна`);
      }

      return `day-${chest.dayNumber}`;
    }
    case 'three_days':
      return 'three-days';
    case 'week':
      return 'week';
  }
};

/**
 * Приз сундука акции: `campaign:<slug>:<persons.id>:<chest>`, хвост — `day-1` … `day-7`,
 * `three-days`, `week`.
 *
 * На одну часть длиннее массового начисления: у участника до девяти сундуков в акции, и общий
 * ключ вернул бы приз второго сундука как повтор первого (docs/points.md). Хвост именуется,
 * а не берётся из `campaign_chests.id`: строка сундука рождается в той же транзакции, и ключ
 * обязан собираться одинаково при нажатии водителя и при вскрытии по таймеру.
 */
export const buildCampaignChestIdempotencyKey = (
  slug: string,
  personId: string,
  chest: CampaignChestRef,
): IdempotencyKey => {
  const trimmedSlug = slug.trim();
  const trimmedPerson = personId.trim();

  // Пустая часть посередине дала бы ключ, общий для всех акций или всех людей сразу.
  if (trimmedSlug.length === 0 || trimmedPerson.length === 0) {
    throw new Error('ключ сундука акции: метка или человек пусты');
  }

  return buildKey('campaign', `${trimmedSlug}:${trimmedPerson}:${campaignChestTail(chest)}`);
};

/**
 * Читает метку кампании из ключа массового начисления `campaign:<slug>:<persons.id>`
 * и приза сундука `campaign:<slug>:<persons.id>:<chest>`.
 *
 * Читается из ключа, а не из колонки: отдельной сущности «кампания» в базе нет — пока
 * `slug` в ключе отвечает на все вопросы, заводить её незачем (docs/points.md). Экрану
 * карточки метка нужна, чтобы праздничная раздача на три тысячи человек отличалась
 * от трёх тысяч независимых решений оператора.
 *
 * Разбор идёт по префиксу ключа, а не по причине операции: причина говорит, что это акция,
 * а какая — знает только ключ, и он же — единственное место, где метка хранится.
 */
export const readCampaignSlug = (idempotencyKey: string): string | null => {
  const parts = idempotencyKey.split(':');

  // Три части — `campaign`, метка, человек — или четыре, с сундуком в хвосте. Ключ другой
  // длины меткой не считается — угадывать в ключе идемпотентности нечего.
  if ((parts.length !== 3 && parts.length !== 4) || parts[0] !== 'campaign') {
    return null;
  }

  const slug = parts[1];

  return slug && slug.length > 0 ? slug : null;
};
