import type { Language } from '#server/generated/prisma/enums';
import {
  findDriverAccountByPerson,
  listAccountOperationsForOwner,
  type OwnOperationRow,
  type OwnOperationsCursor,
} from '#server/repositories/points';
import { describeOperation } from '#server/services/drivers/memberScreen';
import type { MiniAppHistoryResponse } from '#shared/types/miniapp';

/**
 * История операций водителя, страницей, для его собственного экрана.
 *
 * Отдельным сервисом от `readDriverHistory`, а не её настройкой: та собирает разбор
 * для сотрудника у стойки — вторую сторону перевода с именем, ключ идемпотентности,
 * автора правки и номер заказа. Водителю уходит ровно то, что он видит на экране,
 * и переиспользование админской истории отдало бы ему заодно чужие данные (issue #101).
 *
 * Поездки показываются поштучно и не сворачиваются в строку за день ни при каком их
 * количестве. Свёрнутое «12 сентября — 14 поездок» на спор не отвечает: водитель скажет,
 * что поездок было пятнадцать, и разговор вернётся туда же, откуда начался.
 */

/** Сколько операций в странице. Столько же догружает кнопка «Показать ещё». */
const PAGE_SIZE = 25;

/**
 * Разделитель меток курсора.
 *
 * Вертикальная черта: ни в моменте времени, ни в числе строки журнала её не бывает,
 * и разбор не зависит от того, что попало в половинки метки.
 */
const CURSOR_SEPARATOR = '|';

const buildCursor = (row: OwnOperationRow): string =>
  `${row.occurredAt.toISOString()}${CURSOR_SEPARATOR}${row.entryId}`;

/**
 * Метка страницы обратно в позицию журнала.
 *
 * Мусор означает «первая страница», а не отказ: метку водитель не набирает руками,
 * и единственный способ прислать сюда несуразицу — испорченный запрос, на который
 * экран обязан показать начало истории, а не ошибку. Своего счёта метка не называет,
 * поэтому чужой историей подменённая метка не становится: счёт берётся из подписи.
 */
const parseCursor = (value: string): OwnOperationsCursor | null => {
  const separator = value.indexOf(CURSOR_SEPARATOR);

  if (separator < 0) {
    return null;
  }

  const occurredAt = new Date(value.slice(0, separator));
  const entryId = value.slice(separator + 1);

  if (Number.isNaN(occurredAt.getTime()) || !/^\d+$/.test(entryId)) {
    return null;
  }

  return { occurredAt, entryId };
};

export type MemberHistoryRequest = {
  personId: string;
  language: Language;
  /** Метка из прошлого ответа. Пусто — первая страница. */
  cursor: string;
};

export const readMemberHistory = async (
  request: MemberHistoryRequest,
): Promise<MiniAppHistoryResponse> => {
  const account = await findDriverAccountByPerson(request.personId);

  // Счёта нет — значит нет и журнала. Так выглядит участник, которому ни разу ничего
  // не начисляли: пустоту подписывает экран, а не пустой список без объяснений.
  if (!account) {
    return { operations: [], nextCursor: null };
  }

  // Строкой больше, чем показываем: есть ли следующая страница, отвечает сама выборка.
  // Отдельный `count(*)` по счёту пересчитывал бы весь журнал на каждое нажатие ради
  // одного бита «есть ли ещё».
  const rows = await listAccountOperationsForOwner(
    account.id,
    PAGE_SIZE + 1,
    parseCursor(request.cursor),
  );

  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);

  // Один момент на всю страницу: две строки, посчитанные по разным «сейчас», подписали бы
  // один и тот же день по-разному.
  const now = new Date();

  return {
    operations: page.map((row) => describeOperation(row, request.language, now)),
    nextCursor: rows.length > PAGE_SIZE && last ? buildCursor(last) : null,
  };
};
