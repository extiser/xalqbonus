import { countOfficeFeed, listOfficeFeed, type OfficeFeedRow } from '#server/repositories/officeFeed';
import type { OfficeFeedEntry, OfficeFeedResponse } from '#shared/types/catalog';

/**
 * Страница ленты офиса, новыми вперёд (issue #175): движения остатков и события произвольных
 * наград вперемешку по времени.
 *
 * Журнал движений — истина по остатку, и в строке движения видно всё, из чего складывается
 * ответ «почему остаток такой»: вид, товар, обе дельты, автор, заметка, заказ или награда
 * (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт по офисам»). Событие награды
 * встаёт рядом, потому что иначе выданную произвольную награду офис не видел бы нигде.
 *
 * Потолок страницы ставит сервис: сколько строк отдать за раз — его решение, а не клиента,
 * присланная сотня тысяч не должна становиться запросом на сотню тысяч.
 */

export const DEFAULT_OFFICE_FEED_LIMIT = 25;
const MAX_OFFICE_FEED_LIMIT = 100;

/**
 * Плоская строка запроса в размеченную. Строка без события и без движения значила бы, что
 * запрос разошёлся со своим типом, — это поломка, а не пустая строка на экране.
 */
const toEntry = (row: OfficeFeedRow): OfficeFeedEntry => {
  if (row.rewardEvent !== null && row.rewardId !== null && row.rewardTitle !== null) {
    return {
      type: 'reward',
      reward: {
        rewardId: row.rewardId,
        event: row.rewardEvent,
        rewardTitle: row.rewardTitle,
        campaignTitle: row.campaignTitle,
        employeeName: row.employeeName,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      },
    };
  }

  if (
    row.movementId === null ||
    row.kind === null ||
    row.productId === null ||
    row.productName === null ||
    row.deltaOnHand === null ||
    row.deltaReserved === null
  ) {
    throw new Error('строка ленты офиса — ни движение, ни событие награды');
  }

  return {
    type: 'movement',
    movement: {
      // Идентификатор уезжает строкой: в базе это bigint, а JSON целых такой ширины не знает,
      // и `JSON.stringify` на `BigInt` падает исключением, а не теряет точность молча.
      movementId: row.movementId.toString(),
      kind: row.kind,
      productId: row.productId,
      productName: row.productName,
      deltaOnHand: row.deltaOnHand,
      deltaReserved: row.deltaReserved,
      orderNumber: row.orderNumber,
      rewardTitle: row.rewardTitle,
      employeeName: row.employeeName,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    },
  };
};

export const readOfficeFeed = async (
  officeId: string,
  limit: number,
  offset: number,
): Promise<OfficeFeedResponse> => {
  const cappedLimit = Math.min(Math.max(limit, 1), MAX_OFFICE_FEED_LIMIT);

  const [rows, total] = await Promise.all([
    listOfficeFeed(officeId, cappedLimit, offset),
    countOfficeFeed(officeId),
  ]);

  return { entries: rows.map(toEntry), total, limit: cappedLimit, offset };
};
