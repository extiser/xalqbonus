import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { EmployeeAccessLinkKind } from '#server/generated/prisma/enums';

/**
 * Доступ к одноразовым ссылкам к учётке сотрудника (issue #267): «задать пароль» после
 * сброса и привязка Telegram.
 *
 * Поиск идёт по `sha256` от токена. Сам токен лежит рядом только у живой ссылки — чтобы её
 * можно было показать снова; использование и отзыв его стирают
 * (`employee_access_links_token_live_check`).
 *
 * Открытая ссылка каждого вида у учётки одна — частичным уникальным индексом
 * `employee_access_links_open_key`. Выпуск новой отзывает прежнюю той же транзакцией.
 */

type Executor = Prisma.TransactionClient;

export type EmployeeAccessLinkRow = {
  id: string;
  employeeId: string;
  kind: EmployeeAccessLinkKind;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
};

const LINK_COLUMNS = Prisma.sql`
  link."id",
  link."employee_id" AS "employeeId",
  link."kind",
  link."expires_at"  AS "expiresAt",
  link."used_at"     AS "usedAt",
  link."revoked_at"  AS "revokedAt"
`;

/**
 * Отзывает открытые ссылки этого вида у учётки — живые и истёкшие: индекс открытых ссылок
 * срока не знает, и истёкшая неиспользованная занимала бы место новой.
 */
export const revokeOpenAccessLinks = async (
  employeeId: string,
  kind: EmployeeAccessLinkKind,
  revokedAt: Date,
  client: Executor,
): Promise<void> => {
  await client.$executeRaw`
    UPDATE xb.employee_access_links
       SET "revoked_at" = ${revokedAt},
           "token"      = NULL
     WHERE "employee_id" = ${employeeId}::uuid
       AND "kind" = ${kind}::xb.employee_access_link_kind
       AND "used_at" IS NULL
       AND "revoked_at" IS NULL
  `;
};

export type InsertAccessLinkInput = {
  employeeId: string;
  kind: EmployeeAccessLinkKind;
  token: string;
  tokenHash: string;
  expiresAt: Date;
  issuedById: string;
};

export const insertAccessLink = async (
  input: InsertAccessLinkInput,
  client: Executor,
): Promise<EmployeeAccessLinkRow> => {
  const rows = await client.$queryRaw<EmployeeAccessLinkRow[]>`
    INSERT INTO xb.employee_access_links AS link (
      "employee_id", "kind", "token", "token_hash", "expires_at", "issued_by_id"
    )
    VALUES (
      ${input.employeeId}::uuid,
      ${input.kind}::xb.employee_access_link_kind,
      ${input.token},
      ${input.tokenHash},
      ${input.expiresAt},
      ${input.issuedById}::uuid
    )
    RETURNING ${LINK_COLUMNS}
  `;

  const link = rows[0];

  if (!link) {
    throw new Error('вставка ссылки к учётке не вернула строку');
  }

  return link;
};

export type AccessLinkWithEmployeeRow = EmployeeAccessLinkRow & {
  fullName: string;
  phoneE164: string;
};

/** Ссылка по хешу токена вместе с именем и телефоном учётки — странице «задать пароль». */
export const findAccessLinkByTokenHash = async (
  tokenHash: string,
  client: Executor = db,
): Promise<AccessLinkWithEmployeeRow | null> => {
  const rows = await client.$queryRaw<AccessLinkWithEmployeeRow[]>`
    SELECT ${LINK_COLUMNS},
           employee."full_name"  AS "fullName",
           employee."phone_e164" AS "phoneE164"
      FROM xb.employee_access_links AS link
      JOIN xb.employees             AS employee ON employee."id" = link."employee_id"
     WHERE link."token_hash" = ${tokenHash}
  `;

  return rows[0] ?? null;
};

/**
 * Ссылка по хешу токена — с блокировкой строки: использование решает по ней и пишет в неё
 * одной транзакцией, и два одновременных открытия одной ссылки идут друг за другом, а второе
 * видит её уже использованной.
 */
export const lockAccessLinkByTokenHash = async (
  tokenHash: string,
  client: Executor,
): Promise<EmployeeAccessLinkRow | null> => {
  const rows = await client.$queryRaw<EmployeeAccessLinkRow[]>`
    SELECT ${LINK_COLUMNS}
      FROM xb.employee_access_links AS link
     WHERE link."token_hash" = ${tokenHash}
       FOR UPDATE
  `;

  return rows[0] ?? null;
};

/** Отмечает ссылку использованной и стирает токен. */
export const markAccessLinkUsed = async (
  linkId: string,
  usedAt: Date,
  client: Executor,
): Promise<void> => {
  await client.$executeRaw`
    UPDATE xb.employee_access_links
       SET "used_at" = ${usedAt},
           "token"   = NULL
     WHERE "id" = ${linkId}::uuid
  `;
};

export type LiveAccessLinkRow = {
  employeeId: string;
  token: string;
  expiresAt: Date;
};

/**
 * Живые ссылки этого вида — не использованы, не отозваны, срок не вышел, токен на месте.
 * Без отбора по учётке: экрану сотрудников нужны все сразу, по строке на учётку.
 */
export const listLiveAccessLinks = async (
  kind: EmployeeAccessLinkKind,
  now: Date,
  client: Executor = db,
): Promise<LiveAccessLinkRow[]> =>
  client.$queryRaw<LiveAccessLinkRow[]>`
    SELECT "employee_id" AS "employeeId",
           "token",
           "expires_at"  AS "expiresAt"
      FROM xb.employee_access_links
     WHERE "kind" = ${kind}::xb.employee_access_link_kind
       AND "used_at" IS NULL
       AND "revoked_at" IS NULL
       AND "expires_at" > ${now}
       AND "token" IS NOT NULL
  `;

/** Живая ссылка этого вида у одной учётки. */
export const findLiveAccessLink = async (
  employeeId: string,
  kind: EmployeeAccessLinkKind,
  now: Date,
  client: Executor = db,
): Promise<LiveAccessLinkRow | null> => {
  const rows = await client.$queryRaw<LiveAccessLinkRow[]>`
    SELECT "employee_id" AS "employeeId",
           "token",
           "expires_at"  AS "expiresAt"
      FROM xb.employee_access_links
     WHERE "employee_id" = ${employeeId}::uuid
       AND "kind" = ${kind}::xb.employee_access_link_kind
       AND "used_at" IS NULL
       AND "revoked_at" IS NULL
       AND "expires_at" > ${now}
       AND "token" IS NOT NULL
  `;

  return rows[0] ?? null;
};
