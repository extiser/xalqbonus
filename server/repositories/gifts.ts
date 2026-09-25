import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { GiftClaimMode, RewardStatus } from '#server/generated/prisma/enums';
import { parkDayStartSql } from '#server/utils/parkDaySql';

/**
 * Подарки от Xalq Taxi (issue #219): раздачи `gift_grants` и награды, рождённые ими.
 *
 * Награда-подарок живёт в `rewards` рядом с остальными, а здесь — только то, что нужно
 * подарку: рождение пачкой, блокировка перед зачислением, отметка зачисления и выборки
 * для Mini App и админки. Переходы устроены как у ждущей награды (`repositories/rewards.ts`):
 * строка берётся `FOR UPDATE`, а запись несёт условие на прежний статус.
 *
 * Схема в сыром SQL указывается явно — `xb.gift_grants`, а не `gift_grants`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

type Executor = Prisma.TransactionClient;

/** Сколько строк уходит одной вставкой: сегмент — это тысячи человек. */
const CHUNK_SIZE = 1_000;

export type GiftGrantInput = {
  /** Выдаётся сервисом до записи: под него ложится файл обложки. */
  id: string;
  points: number;
  reasonRu: string;
  reasonUz: string;
  /** День автозачисления в зоне парка, `YYYY-MM-DD`. */
  untilDate: string;
  coverPath: string | null;
  segmentId: string | null;
  personId: string | null;
  recipients: number;
  skipped: number;
  grantedByEmployeeId: string;
};

/** Заводит раздачу. Строку с именами читает `findGiftGrant`. */
export const insertGiftGrant = async (client: Executor, input: GiftGrantInput): Promise<void> => {
  const rows = await client.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.gift_grants (
      "id", "points", "reason_ru", "reason_uz", "until_date", "cover_path", "segment_id", "person_id",
      "recipients", "skipped", "granted_by_employee_id"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.points}::int,
      ${input.reasonRu},
      ${input.reasonUz},
      ${input.untilDate}::date,
      ${input.coverPath},
      ${input.segmentId}::uuid,
      ${input.personId}::uuid,
      ${input.recipients}::int,
      ${input.skipped}::int,
      ${input.grantedByEmployeeId}::uuid
    )
    RETURNING "id"
  `;

  if (!rows[0]) {
    throw new Error('раздача подарка не вставилась');
  }
};

export type GiftRewardsInput = {
  giftGrantId: string;
  personIds: readonly string[];
  points: number;
  title: string;
  /** Повод на русском — копией в `source_note`: его читают стойка и карточка водителя. */
  reasonRu: string;
  untilDate: string;
  grantedByEmployeeId: string;
};

/**
 * Рождает подарки раздачи — по награде `claimable` на человека. Возвращает число вставленных.
 *
 * Срок — конец суток парка `until_date`: 05:00 следующего дня по Ташкенту (docs/decisions.md →
 * «Сутки — с 05:00 до 05:00»). Считает его база тем же выражением, что режет сутки везде,
 * а не код: две копии правила однажды разошлись бы на час.
 *
 * Русский повод копируется в `source_note`, как название товара в `title`: стойка и карточка
 * водителя читают происхождение награды из неё самой. Узбекский водителю отдаётся из раздачи.
 */
export const insertGiftRewards = async (
  client: Executor,
  input: GiftRewardsInput,
): Promise<number> => {
  let inserted = 0;

  for (let offset = 0; offset < input.personIds.length; offset += CHUNK_SIZE) {
    const chunk = input.personIds.slice(offset, offset + CHUNK_SIZE);

    inserted += await client.$executeRaw`
      INSERT INTO xb.rewards (
        "person_id", "kind", "title", "points", "status", "expires_at",
        "source", "source_note", "granted_by_employee_id", "gift_grant_id"
      )
      SELECT person."id",
             'points'::xb.reward_kind,
             ${input.title},
             ${input.points}::int,
             'claimable'::xb.reward_status,
             ${parkDayStartSql(Prisma.sql`${input.untilDate}::date + 1`)},
             'gift'::xb.reward_source,
             ${input.reasonRu},
             ${input.grantedByEmployeeId}::uuid,
             ${input.giftGrantId}::uuid
        FROM unnest(${chunk}::text[]::uuid[]) AS person("id")
    `;
  }

  return inserted;
};

/** Подарок под блокировкой — то, что нужно зачислению. */
export type LockedGiftRow = {
  id: string;
  personId: string;
  status: RewardStatus;
  points: number;
  giftGrantId: string;
};

/**
 * Подарок по идентификатору, под блокировку, в любом статусе: чей он и ждёт ли ещё, решает
 * сервис. Две попытки забрать один подарок — нажатие и прогон по сроку — выстраиваются
 * в очередь, и вторая видит уже `credited`.
 */
export const lockGiftReward = async (
  client: Executor,
  rewardId: string,
): Promise<LockedGiftRow | null> => {
  const rows = await client.$queryRaw<LockedGiftRow[]>`
    SELECT "id",
           "person_id"     AS "personId",
           "status",
           "points",
           "gift_grant_id" AS "giftGrantId"
      FROM xb.rewards
     WHERE "id" = ${rewardId}::uuid
       AND "gift_grant_id" IS NOT NULL
       FOR UPDATE
  `;

  return rows[0] ?? null;
};

/**
 * Переводит подарок в `credited` с моментом и способом зачисления. Условие на `claimable`
 * стоит рядом с записью, хотя статус проверен под блокировкой. Возвращается число строк.
 */
export const markGiftCredited = async (
  client: Executor,
  rewardId: string,
  mode: GiftClaimMode,
  claimedAt: Date,
): Promise<number> =>
  client.$executeRaw`
    UPDATE xb.rewards
       SET "status" = 'credited'::xb.reward_status,
           "claimed_at" = ${claimedAt},
           "claim_mode" = ${mode}::xb.gift_claim_mode,
           "updated_at" = now()
     WHERE "id" = ${rewardId}::uuid AND "status" = 'claimable'
  `;

/**
 * Ждущие подарки, чей срок наступил, — вход автозачисления. Только идентификаторы: каждый
 * зачисляется своей транзакцией и перечитывается под блокировкой. Срок сверяется с часами
 * базы, которыми он и записан.
 */
export const listDueGifts = async (limit: number, afterId: string | null): Promise<{ id: string }[]> =>
  db.$queryRaw<{ id: string }[]>`
    SELECT "id"
      FROM xb.rewards
     WHERE "status" = 'claimable'
       AND "expires_at" <= now()
       AND (${afterId}::uuid IS NULL OR "id" > ${afterId}::uuid)
     ORDER BY "id"
     LIMIT ${limit}
  `;

/** Подарок, ждущий водителя, — для Mini App. */
export type MemberGiftRow = {
  id: string;
  points: number;
  reasonRu: string;
  reasonUz: string;
  untilDate: Date;
  coverPath: string | null;
  shownAt: Date | null;
};

/**
 * Ждущие подарки человека, свежие первыми. Человек входит в условие всегда: чужой подарок
 * отсюда не читается. Повод и день берутся из раздачи — там они записаны один раз.
 */
export const listPersonClaimableGifts = async (
  personId: string,
  client: Executor = db,
): Promise<MemberGiftRow[]> =>
  client.$queryRaw<MemberGiftRow[]>`
    SELECT reward."id",
           reward."points",
           grant_row."reason_ru"   AS "reasonRu",
           grant_row."reason_uz"   AS "reasonUz",
           grant_row."until_date"  AS "untilDate",
           grant_row."cover_path"  AS "coverPath",
           reward."gift_shown_at"  AS "shownAt"
      FROM xb.rewards AS reward
      JOIN xb.gift_grants AS grant_row ON grant_row."id" = reward."gift_grant_id"
     WHERE reward."person_id" = ${personId}::uuid
       AND reward."status" = 'claimable'
     ORDER BY reward."created_at" DESC, reward."id" DESC
  `;

/**
 * Отмечает, что водитель видел шторку со своими подарками. Чужие идентификаторы и не подарки
 * отсекаются условием, а не проверкой до записи; отметка ставится один раз и не двигается.
 */
export const markGiftsShown = async (personId: string, rewardIds: readonly string[]): Promise<number> =>
  db.$executeRaw`
    UPDATE xb.rewards
       SET "gift_shown_at" = now(),
           "updated_at" = now()
     WHERE "person_id" = ${personId}::uuid
       AND "id" = ANY(${rewardIds}::text[]::uuid[])
       AND "gift_grant_id" IS NOT NULL
       AND "gift_shown_at" IS NULL
  `;

/** Раздача глазами сотрудника: кому, что, кто выдал и что стало с подарками. */
export type GiftGrantRow = {
  id: string;
  points: number;
  reasonRu: string;
  reasonUz: string;
  untilDate: Date;
  coverPath: string | null;
  segmentId: string | null;
  segmentName: string | null;
  personId: string | null;
  lastName: string | null;
  firstName: string | null;
  recipients: number;
  skipped: number;
  grantedByName: string;
  createdAt: Date;
  /** Забрали сами. */
  claimedByDriver: number;
  /** Зачислено по сроку. */
  creditedAuto: number;
  /** Ещё ждут. */
  waiting: number;
};

/**
 * Раздача с исходами её подарков. Исходы считаются по наградам раздачи, а не хранятся
 * счётчиками: счётчик, который двигают два пути зачисления, однажды разошёлся бы с наградами.
 *
 * Имя водителя — профилем, как в поиске: работающий важнее уволенного, среди равных свежий.
 */
const giftGrantSelect = (where: Prisma.Sql, limit: number): Prisma.Sql => Prisma.sql`
  SELECT grant_row."id",
         grant_row."points",
         grant_row."reason_ru"    AS "reasonRu",
         grant_row."reason_uz"    AS "reasonUz",
         grant_row."until_date"   AS "untilDate",
         grant_row."cover_path"   AS "coverPath",
         grant_row."segment_id"   AS "segmentId",
         segment."name"           AS "segmentName",
         grant_row."person_id"    AS "personId",
         profile."lastName",
         profile."firstName",
         grant_row."recipients",
         grant_row."skipped",
         author."full_name"       AS "grantedByName",
         grant_row."created_at"   AS "createdAt",
         outcome."claimedByDriver",
         outcome."creditedAuto",
         outcome."waiting"
    FROM xb.gift_grants AS grant_row
    JOIN xb.employees AS author ON author."id" = grant_row."granted_by_employee_id"
    LEFT JOIN xb.segments AS segment ON segment."id" = grant_row."segment_id"
    LEFT JOIN LATERAL (
      SELECT candidate."last_name"  AS "lastName",
             candidate."first_name" AS "firstName"
        FROM xb.park_profiles AS candidate
       WHERE candidate."person_id" = grant_row."person_id"
       ORDER BY (candidate."work_status" = 'working') DESC, candidate."api_updated_at" DESC
       LIMIT 1
    ) AS profile ON TRUE
    CROSS JOIN LATERAL (
      SELECT (count(*) FILTER (WHERE reward."claim_mode" = 'driver'))::int AS "claimedByDriver",
             (count(*) FILTER (WHERE reward."claim_mode" = 'auto'))::int   AS "creditedAuto",
             (count(*) FILTER (WHERE reward."status" = 'claimable'))::int  AS "waiting"
        FROM xb.rewards AS reward
       WHERE reward."gift_grant_id" = grant_row."id"
    ) AS outcome
   WHERE ${where}
   ORDER BY grant_row."created_at" DESC, grant_row."id" DESC
   LIMIT ${limit}
`;

export const listGiftGrants = async (limit: number): Promise<GiftGrantRow[]> =>
  db.$queryRaw<GiftGrantRow[]>(giftGrantSelect(Prisma.sql`TRUE`, limit));

export const findGiftGrant = async (giftGrantId: string): Promise<GiftGrantRow | null> => {
  const rows = await db.$queryRaw<GiftGrantRow[]>(
    giftGrantSelect(Prisma.sql`grant_row."id" = ${giftGrantId}::uuid`, 1),
  );

  return rows[0] ?? null;
};
