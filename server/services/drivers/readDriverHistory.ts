import {
  countAccountOperations,
  findDriverAccountByPerson,
  listAccountOperations,
  type AccountOperationRow,
} from '#server/repositories/points';
import { readCampaignSlug } from '#server/services/points/idempotencyKey';
import type { DriverHistoryResponse, DriverOperation } from '#shared/types/driver';

/**
 * История операций по счёту водителя, страницей.
 *
 * Постранично: у перенесённых водителей операций сотни, и выгрузка журнала целиком
 * в один ответ — это тот же отказ от постраничности, из-за которого экран однажды
 * перестанет открываться.
 *
 * Двойная запись не прячется. Каждая строка называет вторую сторону перевода и её запись
 * журнала: баллы не появляются и не исчезают, они перемещаются между счетами
 * (docs/points.md), и «начислено 1» без ответа на вопрос «откуда» — это ровно тот журнал,
 * которому нечем сойтись.
 */

/** Сколько операций отдаётся за раз, если страница не попросила иначе. */
const DEFAULT_LIMIT = 25;

/** Потолок страницы. */
const MAX_LIMIT = 100;

export type DriverHistoryRequest = {
  personId: string;
  limit: number;
  offset: number;
};

const toOperation = (row: AccountOperationRow): DriverOperation => ({
  transferId: row.transferId,
  reason: row.reason,
  idempotencyKey: row.idempotencyKey,
  campaignSlug: readCampaignSlug(row.idempotencyKey),
  occurredAt: row.occurredAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
  delta: Number(row.delta),
  amount: Number(row.amount),
  counterparty: {
    accountId: row.counterpartyAccountId,
    type: row.counterpartyType,
    personId: row.counterpartyPersonId,
    name: row.counterpartyName,
    delta: row.counterpartyDelta === null ? null : Number(row.counterpartyDelta),
  },
  tripOrderId: row.tripOrderId,
  // Поездка приезжает только целиком: заказ, которого нет в `xb.trips`, оставляет здесь
  // пусто, а идентификатор заказа виден строкой выше. Половина заказа хуже его отсутствия.
  trip:
    row.tripOrderId !== null && row.tripStatus !== null && row.tripPrice !== null
      ? {
          orderId: row.tripOrderId,
          status: row.tripStatus,
          endedAt: row.tripEndedAt?.toISOString() ?? null,
          price: row.tripPrice,
        }
      : null,
  legacyOrderId: row.legacyOrderId,
  actor: row.actor,
  note: row.note,
});

export const readDriverHistory = async (
  request: DriverHistoryRequest,
): Promise<DriverHistoryResponse> => {
  const limit = Math.min(Math.max(request.limit, 1), MAX_LIMIT);
  const offset = Math.max(request.offset, 0);
  const account = await findDriverAccountByPerson(request.personId);

  // Счёта нет — значит нет и журнала. Пустая история здесь означает «в программе
  // не состоит», и подписать это обязан экран, а не пустой список без объяснений.
  if (!account) {
    return { operations: [], total: 0, limit, offset };
  }

  const [operations, total] = await Promise.all([
    listAccountOperations(account.id, limit, offset),
    countAccountOperations(account.id),
  ]);

  return { operations: operations.map(toOperation), total, limit, offset };
};

export { DEFAULT_LIMIT as DEFAULT_HISTORY_LIMIT };
