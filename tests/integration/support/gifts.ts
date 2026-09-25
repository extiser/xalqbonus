import { db } from '#server/db';

/**
 * Чтение и подмена сроков подарков для тестов (issue #219). Уборка — в `cleanupTestData`:
 * подарки уходят с наградами людей, раздачи — следом за ними.
 */

export type GiftSnapshot = {
  status: string;
  claimedAt: Date | null;
  claimMode: string | null;
  giftShownAt: Date | null;
};

export const readGift = async (rewardId: string): Promise<GiftSnapshot | null> => {
  const rows = await db.$queryRaw<GiftSnapshot[]>`
    SELECT "status"::text     AS "status",
           "claimed_at"       AS "claimedAt",
           "claim_mode"::text AS "claimMode",
           "gift_shown_at"    AS "giftShownAt"
      FROM xb.rewards
     WHERE "id" = ${rewardId}::uuid
  `;

  return rows[0] ?? null;
};

/** Подарок человека в раздаче — у раздачи он ровно один (`rewards_gift_grant_id_person_id_key`). */
export const findGiftRewardId = async (giftGrantId: string, personId: string): Promise<string> => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id"
      FROM xb.rewards
     WHERE "gift_grant_id" = ${giftGrantId}::uuid AND "person_id" = ${personId}::uuid
  `;
  const row = rows[0];

  if (!row) {
    throw new Error(`у раздачи ${giftGrantId} нет подарка человеку ${personId}`);
  }

  return row.id;
};

export const readGiftGrantCounters = async (
  giftGrantId: string,
): Promise<{ recipients: number; skipped: number; rewards: number } | null> => {
  const rows = await db.$queryRaw<{ recipients: number; skipped: number; rewards: number }[]>`
    SELECT grant_row."recipients",
           grant_row."skipped",
           (SELECT count(*)::int FROM xb.rewards WHERE "gift_grant_id" = grant_row."id") AS "rewards"
      FROM xb.gift_grants AS grant_row
     WHERE grant_row."id" = ${giftGrantId}::uuid
  `;

  return rows[0] ?? null;
};

/**
 * Отправляет срок подарка в прошлое — так выглядит подарок, чей день наступил. Срок
 * сравнивается с `now()` базы, поэтому и сдвигается базой.
 */
export const expireTestGift = async (rewardId: string): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.rewards
       SET "expires_at" = now() - make_interval(hours => 1)
     WHERE "id" = ${rewardId}::uuid
  `;
};

/**
 * Отодвигает вручение и зачисление подарка на `hours` часов назад — для порядка в разделе
 * водителя, как `backdateTestReward` у прочих наград.
 */
export const backdateTestGift = async (rewardId: string, hours: number): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.rewards
       SET "created_at" = now() - make_interval(hours => ${hours}::int),
           "claimed_at" = CASE WHEN "claimed_at" IS NULL THEN NULL
                               ELSE now() - make_interval(hours => ${hours}::int) END
     WHERE "id" = ${rewardId}::uuid
  `;
};
