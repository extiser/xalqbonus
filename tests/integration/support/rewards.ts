import { db } from '#server/db';

/**
 * Чтение и подмена сроков наград для тестов (issue #172). Уборка наград — в `cleanupTestData`:
 * они ссылаются на людей, товары и офисы, и уходят вместе с ними.
 */

export type RewardSnapshot = {
  status: string;
  code: string | null;
  issuedAt: Date | null;
  issuedByEmployeeId: string | null;
  expiredAt: Date | null;
};

export const readReward = async (rewardId: string): Promise<RewardSnapshot | null> => {
  const rows = await db.$queryRaw<RewardSnapshot[]>`
    SELECT "status"::text                AS "status",
           "code",
           "issued_at"                   AS "issuedAt",
           "issued_by_employee_id"       AS "issuedByEmployeeId",
           "expired_at"                  AS "expiredAt"
      FROM xb.rewards
     WHERE "id" = ${rewardId}::uuid
  `;

  return rows[0] ?? null;
};

/** Сколько наград у человека. Ноль — то, что проверяют сценарии отказа. */
export const countRewardsByPerson = async (personId: string): Promise<number> => {
  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total" FROM xb.rewards WHERE "person_id" = ${personId}::uuid
  `;

  return rows[0]?.total ?? 0;
};

/** Движения остатка, вызванные наградой, по порядку. */
export const listRewardMovements = async (
  rewardId: string,
): Promise<{ kind: string; deltaOnHand: number; deltaReserved: number }[]> =>
  db.$queryRaw<{ kind: string; deltaOnHand: number; deltaReserved: number }[]>`
    SELECT "kind"::text     AS "kind",
           "delta_on_hand"  AS "deltaOnHand",
           "delta_reserved" AS "deltaReserved"
      FROM xb.stock_movements
     WHERE "reward_id" = ${rewardId}::uuid
     ORDER BY "id"
  `;

/**
 * Отправляет срок награды в прошлое — так выглядит награда, которую не забрали. Срок
 * сравнивается с `now()` базы, поэтому и сдвигается базой.
 */
/**
 * Отодвигает вручение награды на `hours` часов назад. Порядок в разделе водителя идёт по моментам
 * событий, и тесту нужны моменты, разведённые наверняка, а не на микросекунды между запросами.
 */
export const backdateTestReward = async (rewardId: string, hours: number): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.rewards
       SET "created_at" = now() - make_interval(hours => ${hours}::int)
     WHERE "id" = ${rewardId}::uuid
  `;
};

export const expireTestReward = async (rewardId: string): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.rewards
       SET "expires_at" = now() - make_interval(hours => 1)
     WHERE "id" = ${rewardId}::uuid
  `;
};
