import { db } from '#server/db';

/**
 * Чтение поездок для начисления баллов.
 *
 * Человек здесь берётся через профиль (`trips.profile_id` → `park_profiles.person_id`),
 * а не хранится в самой поездке: баланс принадлежит человеку, и склейка двойных учётных
 * записей иначе превращалась бы в переписывание миллиона строк (prisma/schema.prisma).
 */

export type TripForAccrual = {
  tripOrderId: string;
  status: string;
  endedAt: Date | null;
  personId: string;
  /** Есть строка `person_settings` — человек участвует в программе. Реестр парка шире. */
  inProgram: boolean;
};

export const findTripsForAccrual = async (tripOrderIds: string[]): Promise<TripForAccrual[]> => {
  const trips = await db.trip.findMany({
    where: { orderId: { in: tripOrderIds } },
    select: {
      orderId: true,
      status: true,
      endedAt: true,
      profile: {
        select: {
          personId: true,
          person: { select: { settings: { select: { personId: true } } } },
        },
      },
    },
  });

  return trips.map((trip) => ({
    tripOrderId: trip.orderId,
    status: trip.status,
    endedAt: trip.endedAt,
    personId: trip.profile.personId,
    inProgram: trip.profile.person.settings !== null,
  }));
};
