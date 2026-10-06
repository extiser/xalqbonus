import { consola } from 'consola';

import { db } from '#server/db';
import {
  clearWelcomeBonusSeen,
  deleteTransfersWithEntries,
  deleteTripsWithDetails,
  findDemoFlag,
  findTransferIdsByKeys,
  lockDemoDriverAccounts,
  lockDemoTrips,
  type RevertedAccountRow,
} from '#server/repositories/demo';
import { countCompletedTripsByPerson } from '#server/repositories/trips';
import { DemoTripNotFoundError, NotDemoDriverError } from '#server/services/demo/errors';
import { WELCOME_TRIPS_REQUIRED } from '#server/services/points/awardWelcomeBonus';
import { buildTripIdempotencyKey, buildWelcomeIdempotencyKey } from '#server/services/points/idempotencyKey';
import type { DemoTripsDeleteResponse } from '#shared/types/demo';

/**
 * Удаление поездок демо-водителя (issue #422): одной или всех — вместе с баллами за них
 * и с приветственным бонусом, если завершённых поездок после вступления стало меньше пяти.
 * Нужно, чтобы путь бонуса — «Ещё 5 поездок» → «Ура!» → «Спасибо» — прогонялся на демо-водителе
 * заново: зритель у демо-водителя один и навсегда.
 *
 * Это исключение из «баланс меняется только записью в журнал» (docs/points.md), а не сторно:
 * встречная запись оставила бы ключ `welcome:<person_id>` занятым, и второй бонус не выдался бы
 * никогда (docs/decisions.md → «Демо-поездки удаляются вместе с начислениями»). Исключение
 * держат три условия, и все — здесь: человек демо, поездка `demo-…`, удаляются только переводы
 * по ключам `trip:<order_id>` этих поездок и `welcome:<person_id>`. Остальные переводы водителя —
 * `demo_grant`, заказы, подарки, акция — не трогаются.
 *
 * Всё — одной транзакцией: поездка без своего балла или балл без своей поездки в журнале
 * остаться не могут.
 */

const log = consola.withTag('demo:trips-delete');

export type DeleteDemoTripsRequest = {
  personId: string;
  /** Заказ одной поездки. Пусто — все поездки демо-водителя. */
  orderId: string | null;
};

/** Сколько снято со счёта водителя — сумма его удалённых записей: зачисления в ней со знаком «+». */
const sumDriverDelta = (reverted: readonly RevertedAccountRow[], driverAccountId: string | null): bigint =>
  reverted
    .filter((row) => row.accountId === driverAccountId)
    .reduce((total, row) => total + row.delta, 0n);

export const deleteDemoTrips = async ({ personId, orderId }: DeleteDemoTripsRequest): Promise<DemoTripsDeleteResponse> => {
  const result = await db.$transaction(async (transaction): Promise<DemoTripsDeleteResponse> => {
    // Признак демо — первым: живому водителю отказ один, что бы ни пришло в запросе.
    if ((await findDemoFlag('person', personId, transaction)) !== true) {
      throw new NotDemoDriverError(personId);
    }

    const trips = await lockDemoTrips(personId, orderId, transaction);

    if (orderId !== null && trips.length === 0) {
      throw new DemoTripNotFoundError(personId, orderId);
    }

    // Счета — до любой записи и в порядке перевода: начисление, идущее разом с удалением,
    // ждёт его конца, а не встаёт с ним в дедлок.
    const accounts = await lockDemoDriverAccounts(personId, transaction);
    const driverAccountId = accounts.find((account) => account.type === 'driver')?.id ?? null;

    const tripTransferIds = await findTransferIdsByKeys(
      trips.map((trip) => buildTripIdempotencyKey(trip.orderId)),
      transaction,
    );
    const tripReverted = await deleteTransfersWithEntries(tripTransferIds, transaction);
    const deletedTrips = await deleteTripsWithDetails(
      trips.map((trip) => trip.id),
      transaction,
    );

    // Бонус решается по поездкам, оставшимся после удаления, — тем же клиентом: глобальный
    // видел бы удалённые поездки до фиксации транзакции.
    const welcomeTransferIds = await findTransferIdsByKeys([buildWelcomeIdempotencyKey(personId)], transaction);
    let welcomeReverted: RevertedAccountRow[] = [];

    if (
      welcomeTransferIds.length > 0 &&
      (await countCompletedTripsByPerson(personId, WELCOME_TRIPS_REQUIRED, transaction)) < WELCOME_TRIPS_REQUIRED
    ) {
      welcomeReverted = await deleteTransfersWithEntries(welcomeTransferIds, transaction);
      await clearWelcomeBonusSeen(personId, transaction);
    }

    const deletedPoints = sumDriverDelta(tripReverted, driverAccountId) + sumDriverDelta(welcomeReverted, driverAccountId);

    return {
      deletedTrips,
      deletedPoints: Number(deletedPoints),
      welcomeBonusRemoved: welcomeReverted.length > 0,
    };
  });

  log.info('Поездки демо-водителя удалены', {
    personId,
    orderId,
    deletedTrips: result.deletedTrips,
    deletedPoints: result.deletedPoints,
    welcomeBonusRemoved: result.welcomeBonusRemoved,
  });

  return result;
};
