import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type {
  RewardKind,
  RewardSource,
  RewardStatus,
} from '#server/generated/prisma/enums';
import type { OfficeRow } from '#server/repositories/offices';
import {
  DESK_DRIVER_COLUMNS,
  deskDriverJoins,
  type DeskDriverColumns,
} from '#server/repositories/deskDriver';

/**
 * Награды водителю (issue #172).
 *
 * Устроены как заказы (`repositories/orders.ts`): операции над ждущей наградой берут её строку
 * `FOR UPDATE` и проверяют статус под блокировкой, а переход пишется условием на прежний статус
 * внутри `UPDATE`. Две выдачи одного кода, пришедшие разом, выстраиваются в очередь, и вторая
 * видит уже `issued` (docs/principles.md → «Идемпотентность вместо аккуратности»).
 *
 * Схема в сыром SQL указывается явно — `xb.rewards`, а не `rewards`
 * (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

type Executor = Prisma.TransactionClient;

export type RewardRow = {
  id: string;
  personId: string;
  kind: RewardKind;
  title: string;
  points: number | null;
  productId: string | null;
  officeId: string | null;
  code: string | null;
  status: RewardStatus;
  expiresAt: Date | null;
  source: RewardSource;
  createdAt: Date;
};

const REWARD_COLUMNS = Prisma.sql`
  "id",
  "person_id"  AS "personId",
  "kind",
  "title",
  "points",
  "product_id" AS "productId",
  "office_id"  AS "officeId",
  "code",
  "status",
  "expires_at" AS "expiresAt",
  "source",
  "created_at" AS "createdAt"
`;

export type InsertRewardInput = {
  personId: string;
  kind: RewardKind;
  title: string;
  points: number | null;
  productId: string | null;
  officeId: string | null;
  /** Пусто у баллов. У остальных — код из диапазона наград. */
  code: string | null;
  status: RewardStatus;
  /** Сколько дней награда ждёт в офисе. Пусто у баллов. Срок считает база — её часами. */
  lifetimeDays: number | null;
  source: RewardSource;
  campaignId: string | null;
  sourceNote: string | null;
  grantedByEmployeeId: string | null;
};

/**
 * Вставляет награду.
 *
 * `null` означает ровно одно: код уже занят другой ждущей наградой. Отказ гасится
 * `ON CONFLICT … DO NOTHING` по частичному индексу, а не ловится исключением: отбитая вставка
 * отравляет транзакцию целиком, и попытка с новым кодом потребовала бы переоткрыть её вместе
 * с уже взятой блокировкой остатка — тот же довод, что у `insertOrder`.
 */
export const insertReward = async (
  client: Executor,
  input: InsertRewardInput,
): Promise<RewardRow | null> => {
  const rows = await client.$queryRaw<RewardRow[]>`
    INSERT INTO xb.rewards (
      "person_id", "kind", "title", "points", "product_id", "office_id", "code", "status",
      "expires_at", "source", "campaign_id", "source_note", "granted_by_employee_id"
    )
    VALUES (
      ${input.personId}::uuid,
      ${input.kind}::xb.reward_kind,
      ${input.title},
      ${input.points}::int,
      ${input.productId}::uuid,
      ${input.officeId}::uuid,
      ${input.code},
      ${input.status}::xb.reward_status,
      CASE WHEN ${input.lifetimeDays}::int IS NULL THEN NULL
           ELSE now() + make_interval(days => ${input.lifetimeDays}::int) END,
      ${input.source}::xb.reward_source,
      ${input.campaignId}::uuid,
      ${input.sourceNote},
      ${input.grantedByEmployeeId}::uuid
    )
    ON CONFLICT ("code") WHERE "status" = 'awaiting' DO NOTHING
    RETURNING ${REWARD_COLUMNS}
  `;

  return rows[0] ?? null;
};

/**
 * Ждущая награда по идентификатору, под блокировку.
 *
 * `status = 'awaiting'` стоит в условии: вторая выдача, дождавшись первой, перечитывает
 * условие на новой версии строки и не получает ничего — тем же приёмом, что
 * `lockPendingOrderById`. По идентификатору, а не по коду: код освобождается выдачей и может
 * достаться новой награде того же офиса.
 */
export const lockAwaitingRewardById = async (
  client: Executor,
  rewardId: string,
): Promise<RewardRow | null> => {
  const rows = await client.$queryRaw<RewardRow[]>`
    SELECT ${REWARD_COLUMNS}
      FROM xb.rewards
     WHERE "id" = ${rewardId}::uuid
       AND "status" = 'awaiting'
       FOR UPDATE
  `;

  return rows[0] ?? null;
};

/**
 * Переводит награду в `issued`. Условие на `awaiting` стоит рядом с записью, хотя статус
 * проверен под блокировкой. Возвращается число изменённых строк.
 */
export const markRewardIssued = async (
  client: Executor,
  rewardId: string,
  employeeId: string,
  issuedAt: Date,
): Promise<number> =>
  client.$executeRaw`
    UPDATE xb.rewards
       SET "status" = 'issued'::xb.reward_status,
           "issued_at" = ${issuedAt},
           "issued_by_employee_id" = ${employeeId}::uuid,
           "updated_at" = now()
     WHERE "id" = ${rewardId}::uuid AND "status" = 'awaiting'
  `;

/** Переводит награду в `expired`. Условие на `awaiting` — как у выдачи. */
export const markRewardExpired = async (
  client: Executor,
  rewardId: string,
  expiredAt: Date,
): Promise<number> =>
  client.$executeRaw`
    UPDATE xb.rewards
       SET "status" = 'expired'::xb.reward_status,
           "expired_at" = ${expiredAt},
           "updated_at" = now()
     WHERE "id" = ${rewardId}::uuid AND "status" = 'awaiting'
  `;

/**
 * Ждущие награды с истёкшим сроком — вход прогона сгорания. Только идентификаторы: каждая
 * сгорает своей транзакцией и перечитывается под блокировкой. Срок сверяется с часами базы,
 * которыми он и записан.
 */
export const listExpiredAwaitingRewards = async (limit: number): Promise<{ id: string }[]> =>
  db.$queryRaw<{ id: string }[]>`
    SELECT "id"
      FROM xb.rewards
     WHERE "status" = 'awaiting' AND "expires_at" < now()
     ORDER BY "expires_at"
     LIMIT ${limit}
  `;

/** Поля награды, общие у раздела водителя и карточки водителя в админке. */
type PersonRewardColumns = {
  id: string;
  kind: RewardKind;
  title: string;
  points: number | null;
  code: string | null;
  status: RewardStatus;
  expiresAt: Date | null;
  issuedAt: Date | null;
  expiredAt: Date | null;
  source: RewardSource;
  sourceNote: string | null;
  campaignTitle: string | null;
  createdAt: Date;
};

export type PersonRewardRow = PersonRewardColumns & {
  /** Офис выдачи целиком — архивный тоже: награда уже родилась с ним. Пуст у баллов. */
  office: OfficeRow | null;
  /** Фото и цена товара из каталога — у награды-товара. У остальных пусто. */
  photoPath: string | null;
  photoUpdatedAt: Date | null;
  pricePoints: number | null;
};

/** Строка запроса как она приходит из базы: офис плоскими колонками с приставкой. */
type PersonRewardQueryRow = Omit<PersonRewardRow, 'office'> & {
  officeId: string | null;
  officeName: string | null;
  officeAddress: string | null;
  officeMapUrl: string | null;
  officeWorkHours: string | null;
  officePhoneE164: string | null;
  officeTelegram: string | null;
  officeArchivedAt: Date | null;
  officeUpdatedAt: Date | null;
};

/**
 * Награды человека для раздела водителя. Человек входит в условие всегда: чужая награда отсюда
 * не читается ни при каком запросе.
 *
 * Ждущие первыми, дальше — по последнему событию награды: выдаче, сгоранию или вручению.
 * По вручению выданная у стойки уезжала в истории ниже баллов, вручённых позже неё, хотя
 * случилась последней (прогон PR #222, 25-09-2026). Порядок стоит в запросе, а не на экране:
 * иначе потолок срезал бы не то. Карточка водителя в админке сортируется по-своему.
 */
export const listPersonRewards = async (
  personId: string,
  limit: number,
  client: Executor = db,
): Promise<PersonRewardRow[]> => {
  const rows = await client.$queryRaw<PersonRewardQueryRow[]>`
    SELECT reward."id",
           reward."kind",
           reward."title",
           reward."points",
           reward."code",
           reward."status",
           reward."expires_at"   AS "expiresAt",
           reward."issued_at"    AS "issuedAt",
           reward."expired_at"   AS "expiredAt",
           reward."source",
           reward."source_note"  AS "sourceNote",
           campaign."title"      AS "campaignTitle",
           reward."created_at"   AS "createdAt",
           office."id"           AS "officeId",
           office."name"         AS "officeName",
           office."address"      AS "officeAddress",
           office."map_url"      AS "officeMapUrl",
           office."work_hours"   AS "officeWorkHours",
           office."phone_e164"   AS "officePhoneE164",
           office."telegram"     AS "officeTelegram",
           office."archived_at"  AS "officeArchivedAt",
           office."updated_at"   AS "officeUpdatedAt",
           product."photo_path"  AS "photoPath",
           product."updated_at"  AS "photoUpdatedAt",
           product."price_points" AS "pricePoints"
      FROM xb.rewards AS reward
      LEFT JOIN xb.offices   AS office   ON office."id" = reward."office_id"
      LEFT JOIN xb.campaigns AS campaign ON campaign."id" = reward."campaign_id"
      LEFT JOIN xb.products  AS product  ON product."id" = reward."product_id"
     WHERE reward."person_id" = ${personId}::uuid
     ORDER BY (reward."status" = 'awaiting') DESC,
              COALESCE(reward."issued_at", reward."expired_at", reward."created_at") DESC,
              reward."created_at" DESC
     LIMIT ${limit}
  `;

  return rows.map(
    ({
      officeId,
      officeName,
      officeAddress,
      officeMapUrl,
      officeWorkHours,
      officePhoneE164,
      officeTelegram,
      officeArchivedAt,
      officeUpdatedAt,
      ...reward
    }) => ({
      ...reward,
      // Имя, адрес и отметка правки у офиса обязательны: пусты они только без офиса вовсе.
      office:
        officeId === null || officeName === null || officeAddress === null || officeUpdatedAt === null
          ? null
          : {
              id: officeId,
              name: officeName,
              address: officeAddress,
              mapUrl: officeMapUrl,
              workHours: officeWorkHours,
              phoneE164: officePhoneE164,
              telegram: officeTelegram,
              archivedAt: officeArchivedAt,
              updatedAt: officeUpdatedAt,
            },
    }),
  );
};

export type OfficeRewardRow = DeskDriverColumns & {
  id: string;
  kind: RewardKind;
  title: string;
  code: string | null;
  status: RewardStatus;
  officeId: string;
  officeName: string;
  expiresAt: Date;
  issuedAt: Date | null;
  expiredAt: Date | null;
  source: RewardSource;
  sourceNote: string | null;
  campaignTitle: string | null;
  createdAt: Date;
};

/**
 * Награда глазами сотрудника у стойки: сама награда, офис, источник и водитель с позывным
 * и телефоном — тем же куском `deskDriver.ts`, что у заказа.
 *
 * Только награды с офисом: у баллов его нет, и у стойки им делать нечего.
 */
const OFFICE_REWARD_SELECT = Prisma.sql`
  SELECT reward."id",
         reward."kind",
         reward."title",
         reward."code",
         reward."status",
         reward."office_id"   AS "officeId",
         office."name"        AS "officeName",
         reward."expires_at"  AS "expiresAt",
         reward."issued_at"   AS "issuedAt",
         reward."expired_at"  AS "expiredAt",
         reward."source",
         reward."source_note" AS "sourceNote",
         campaign."title"     AS "campaignTitle",
         reward."created_at"  AS "createdAt",
         ${DESK_DRIVER_COLUMNS}
    FROM xb.rewards AS reward
    JOIN xb.offices AS office ON office."id" = reward."office_id"
    LEFT JOIN xb.campaigns AS campaign ON campaign."id" = reward."campaign_id"
    ${deskDriverJoins(Prisma.sql`reward."person_id"`)}
`;

/** Одна награда по идентификатору — без блокировки: чтение для экрана и проверки офиса. */
export const findOfficeReward = async (
  rewardId: string,
  client: Executor = db,
): Promise<OfficeRewardRow | null> => {
  const rows = await client.$queryRaw<OfficeRewardRow[]>`
    ${OFFICE_REWARD_SELECT}
     WHERE reward."id" = ${rewardId}::uuid
  `;

  return rows[0] ?? null;
};

/**
 * Ждущая награда по коду **и офису** — без блокировки. Офис входит в условие, а не проверяется
 * после: код не подтверждает существование награды тому, кто стоит не в том офисе.
 */
export const findAwaitingOfficeRewardByCode = async (
  officeId: string,
  code: string,
  client: Executor = db,
): Promise<OfficeRewardRow | null> => {
  const rows = await client.$queryRaw<OfficeRewardRow[]>`
    ${OFFICE_REWARD_SELECT}
     WHERE reward."code" = ${code}
       AND reward."office_id" = ${officeId}::uuid
       AND reward."status" = 'awaiting'
  `;

  return rows[0] ?? null;
};

export type DriverRewardRow = PersonRewardColumns & {
  /** Офис выдачи. Пуст у баллов. */
  officeName: string | null;
  officeAddress: string | null;
  /** Кто выдал у стойки. Пусто у всех, кроме выданной. */
  issuedByName: string | null;
  /** Кто вручил. Пусто у наград акции. */
  grantedByName: string | null;
};

/**
 * Награды человека глазами сотрудника в карточке водителя (issue #175): те же поля, что
 * у раздела водителя, плюс имена сотрудников — кто вручил и кто выдал.
 *
 * Ждущие в офисе идут первыми независимо от даты — за ними водитель придёт, остальное история.
 * Порядок стоит в запросе, а не на экране: иначе потолок срезал бы старую ждущую награду
 * раньше свежей полученной.
 */
export const listDriverRewards = async (
  personId: string,
  limit: number,
  client: Executor = db,
): Promise<DriverRewardRow[]> =>
  client.$queryRaw<DriverRewardRow[]>`
    SELECT reward."id",
           reward."kind",
           reward."title",
           reward."points",
           reward."code",
           reward."status",
           reward."expires_at"  AS "expiresAt",
           reward."issued_at"   AS "issuedAt",
           reward."expired_at"  AS "expiredAt",
           reward."source",
           reward."source_note" AS "sourceNote",
           campaign."title"     AS "campaignTitle",
           office."name"        AS "officeName",
           office."address"     AS "officeAddress",
           issuer."full_name"   AS "issuedByName",
           granter."full_name"  AS "grantedByName",
           reward."created_at"  AS "createdAt"
      FROM xb.rewards AS reward
      LEFT JOIN xb.offices   AS office   ON office."id" = reward."office_id"
      LEFT JOIN xb.campaigns AS campaign ON campaign."id" = reward."campaign_id"
      LEFT JOIN xb.employees AS issuer   ON issuer."id" = reward."issued_by_employee_id"
      LEFT JOIN xb.employees AS granter  ON granter."id" = reward."granted_by_employee_id"
     WHERE reward."person_id" = ${personId}::uuid
     ORDER BY (reward."status" = 'awaiting') DESC, reward."created_at" DESC
     LIMIT ${limit}
  `;
