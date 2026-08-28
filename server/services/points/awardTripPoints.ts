import { consola } from 'consola';
import { findTripsForAccrual, type TripForAccrual } from '#server/repositories/trips';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import { buildTripIdempotencyKey } from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';

/**
 * Начисление баллов за завершённые поездки.
 *
 * Поездки берутся из `xb.trips` — кто их туда положил, сервису не важно: синхронизация
 * с Fleet API живёт отдельно и приходит этапом 3. Курс — один балл за завершённую поездку,
 * независимо от суммы и длительности (docs/points.md → «Начисление за поездки»).
 *
 * Прогон безопасно повторять сколько угодно раз и по перекрывающимся наборам поездок:
 * идемпотентность держится ключом `trip:<order_id>` и уникальным ограничением в базе,
 * а не тем, чтобы не позвать дважды.
 */

const log = consola.withTag('points:trip-accrual');

/** Курс. Продуктовое решение, унаследованное как есть (docs/points.md). */
const POINTS_PER_COMPLETED_TRIP = 1;

/** Единственный статус, за который начисляется балл. Значение из словаря Fleet API. */
const COMPLETED_STATUS = 'complete';

export type TripAccrualSummary = {
  /** Сколько различных поездок пришло на вход. */
  requested: number;
  /** Начислено сейчас. */
  awarded: number;
  /** Уже было начислено раньше: повтор по ключу, ни один баланс не тронут. */
  alreadyAwarded: number;
  /** Промежуточный статус: балл не начислен и поездка не помечена обработанной. */
  notCompleted: number;
  /** Статус `complete`, но времени завершения нет: начислять не от чего. */
  withoutEndedAt: number;
  /** Человек известен парку, но в программе не участвует. Это норма, а не ошибка. */
  outsideProgram: number;
  /** Идентификатора заказа нет в `xb.trips`. */
  unknownTrip: number;
};

const emptySummary = (requested: number): TripAccrualSummary => ({
  requested,
  awarded: 0,
  alreadyAwarded: 0,
  notCompleted: 0,
  withoutEndedAt: 0,
  outsideProgram: 0,
  unknownTrip: 0,
});

/** Причина, по которой балл за поездку не начисляется. Имя причины — поле сводки. */
type SkipReason = 'notCompleted' | 'withoutEndedAt' | 'outsideProgram';

type AccrualDecision =
  | { accrue: true; occurredAt: Date }
  | { accrue: false; skipReason: SkipReason };

/**
 * Решает, начисляется ли балл за поездку. Время операции — время завершения поездки,
 * а не время прогона: журнал должен показывать, когда операция произошла на самом деле.
 */
const decideAccrual = (trip: TripForAccrual): AccrualDecision => {
  // Поездка в промежуточном статусе не начисляется и не помечается обработанной: она
  // вернётся позже с временем завершения в прошлом и начислится тогда. Именно на этом
  // старый бот терял пятую часть поездок (docs/analysis.md).
  if (trip.status !== COMPLETED_STATUS) {
    return { accrue: false, skipReason: 'notCompleted' };
  }

  if (!trip.endedAt) {
    log.warn('Завершённая поездка без времени завершения — начисление отложено', {
      tripOrderId: trip.tripOrderId,
    });
    return { accrue: false, skipReason: 'withoutEndedAt' };
  }

  // Реестр парка шире программы: у человека может не быть строки `person_settings`,
  // и это штатный случай, а не отказ. Прогон он не роняет, но в сводку попадает.
  if (!trip.inProgram) {
    return { accrue: false, skipReason: 'outsideProgram' };
  }

  return { accrue: true, occurredAt: trip.endedAt };
};

export const awardTripPoints = async (tripOrderIds: string[]): Promise<TripAccrualSummary> => {
  // Повторы на входе — обычное дело при перекрытии окон опроса. На результат они
  // не влияют, но испортили бы счётчик «поездок не нашлось».
  const uniqueOrderIds = [...new Set(tripOrderIds)];
  const summary = emptySummary(uniqueOrderIds.length);

  if (uniqueOrderIds.length === 0) {
    return summary;
  }

  const trips = await findTripsForAccrual(uniqueOrderIds);
  summary.unknownTrip = uniqueOrderIds.length - trips.length;

  const emissionAccount = await getSystemAccount('emission');

  // Поездки обрабатываются по одной, а не пачкой параллельных транзакций: у пачки
  // начислений одному водителю все переводы дерутся за один и тот же счёт, и выигрыш
  // от параллелизма съедается ожиданием блокировки.
  for (const trip of trips) {
    const decision = decideAccrual(trip);

    if (!decision.accrue) {
      summary[decision.skipReason] += 1;
      continue;
    }

    const driverAccount = await ensureDriverAccount(trip.personId);

    const { applied } = await transferPoints({
      reason: 'trip',
      idempotencyKey: buildTripIdempotencyKey(trip.tripOrderId),
      amount: POINTS_PER_COMPLETED_TRIP,
      fromAccountId: emissionAccount.id,
      toAccountId: driverAccount.id,
      occurredAt: decision.occurredAt,
      context: { tripOrderId: trip.tripOrderId },
    });

    if (applied) {
      summary.awarded += 1;
    } else {
      summary.alreadyAwarded += 1;
    }
  }

  log.info('Прогон начисления за поездки завершён', summary);

  return summary;
};
