import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type { EmployeeRole } from '#server/generated/prisma/enums';

/**
 * Доступ к приглашениям сотрудников.
 *
 * Поиск идёт по `sha256` от токена. Сам токен лежит рядом только у живого приглашения —
 * чтобы ссылку можно было скопировать, пока она работает (issue #267); принятие и отзыв его
 * стирают, и это держит проверка `employee_invites_token_live_check`.
 */

type Executor = Prisma.TransactionClient;

export type EmployeeInviteRow = {
  id: string;
  role: EmployeeRole;
  /** Пусто у выпущенных до приёма в вебе — они отозваны миграцией. */
  fullName: string | null;
  phoneE164: string | null;
  invitedById: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  employeeId: string | null;
  revokedAt: Date | null;
};

const INVITE_COLUMNS = Prisma.sql`
  "id",
  "role",
  "full_name"     AS "fullName",
  "phone_e164"    AS "phoneE164",
  "invited_by_id" AS "invitedById",
  "expires_at"    AS "expiresAt",
  "accepted_at"   AS "acceptedAt",
  "employee_id"   AS "employeeId",
  "revoked_at"    AS "revokedAt"
`;

export type InsertEmployeeInviteInput = {
  role: EmployeeRole;
  fullName: string;
  phoneE164: string;
  token: string;
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
};

export const insertEmployeeInvite = async (
  input: InsertEmployeeInviteInput,
  client: Executor = db,
): Promise<EmployeeInviteRow> => {
  const rows = await client.$queryRaw<EmployeeInviteRow[]>`
    INSERT INTO xb.employee_invites (
      "role", "full_name", "phone_e164", "token", "token_hash", "invited_by_id", "expires_at"
    )
    VALUES (
      ${input.role}::xb.employee_role,
      ${input.fullName},
      ${input.phoneE164},
      ${input.token},
      ${input.tokenHash},
      ${input.invitedById}::uuid,
      ${input.expiresAt}
    )
    RETURNING ${INVITE_COLUMNS}
  `;

  const invite = rows[0];

  if (!invite) {
    throw new Error('вставка приглашения не вернула строку');
  }

  return invite;
};

export const findEmployeeInviteByTokenHash = async (
  tokenHash: string,
  client: Executor = db,
): Promise<EmployeeInviteRow | null> => {
  const rows = await client.$queryRaw<EmployeeInviteRow[]>`
    SELECT ${INVITE_COLUMNS}
      FROM xb.employee_invites
     WHERE "token_hash" = ${tokenHash}
  `;

  return rows[0] ?? null;
};

/**
 * Приглашение по хешу токена — с блокировкой строки: принятие решает по ней и пишет в неё
 * одной транзакцией, и два одновременных «Принять» одной ссылки идут друг за другом, а второе
 * видит её уже принятой.
 */
export const lockEmployeeInviteByTokenHash = async (
  tokenHash: string,
  client: Executor,
): Promise<EmployeeInviteRow | null> => {
  const rows = await client.$queryRaw<EmployeeInviteRow[]>`
    SELECT ${INVITE_COLUMNS}
      FROM xb.employee_invites
     WHERE "token_hash" = ${tokenHash}
       FOR UPDATE
  `;

  return rows[0] ?? null;
};

export const findEmployeeInviteById = async (
  inviteId: string,
  client: Executor = db,
): Promise<EmployeeInviteRow | null> => {
  const rows = await client.$queryRaw<EmployeeInviteRow[]>`
    SELECT ${INVITE_COLUMNS}
      FROM xb.employee_invites
     WHERE "id" = ${inviteId}::uuid
  `;

  return rows[0] ?? null;
};

/**
 * Живое приглашение на этот телефон: не принято, не отозвано, срок не вышел. Телефон одного
 * живого приглашения — занятый логин, второе на него не выпускается.
 */
export const findLiveEmployeeInviteByPhone = async (
  phoneE164: string,
  now: Date,
  client: Executor = db,
): Promise<EmployeeInviteRow | null> => {
  const rows = await client.$queryRaw<EmployeeInviteRow[]>`
    SELECT ${INVITE_COLUMNS}
      FROM xb.employee_invites
     WHERE "phone_e164" = ${phoneE164}
       AND "accepted_at" IS NULL
       AND "revoked_at" IS NULL
       AND "expires_at" > ${now}
     LIMIT 1
  `;

  return rows[0] ?? null;
};

/**
 * Отмечает приглашение принятым и стирает токен — только непринятое, живое и неотозванное.
 *
 * Условие стоит в самом `UPDATE`, а не только проверкой перед ним: принятие держит строку
 * блокировкой, но условие здесь — последняя линия, если однажды его позовут без неё
 * (docs/principles.md → «Идемпотентность вместо аккуратности»).
 */
export const markEmployeeInviteAccepted = async (
  inviteId: string,
  employeeId: string,
  acceptedAt: Date,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.employee_invites
       SET "accepted_at" = ${acceptedAt},
           "employee_id" = ${employeeId}::uuid,
           "token"       = NULL
     WHERE "id" = ${inviteId}::uuid
       AND "accepted_at" IS NULL
       AND "revoked_at" IS NULL
       AND "expires_at" > ${acceptedAt}
  `;

  return updated === 1;
};

/**
 * Отзывает приглашение и стирает токен. Отозвать можно только непринятое: у принятого уже
 * есть учётка, и выключается она `disabled_at`, а не отзывом ссылки.
 */
export const markEmployeeInviteRevoked = async (
  inviteId: string,
  revokedAt: Date,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.employee_invites
       SET "revoked_at" = ${revokedAt},
           "token"      = NULL
     WHERE "id" = ${inviteId}::uuid
       AND "accepted_at" IS NULL
       AND "revoked_at" IS NULL
  `;

  return updated === 1;
};

export type PendingEmployeeInviteRow = {
  id: string;
  role: EmployeeRole;
  fullName: string | null;
  phoneE164: string | null;
  /** Пусто у выпущенных до приёма в вебе: их ссылку не восстановить. */
  token: string | null;
  /** Кто выписал — имя, а не идентификатор: экрану нужно, кого спросить про ссылку. */
  invitedByName: string;
  createdAt: Date;
  expiresAt: Date;
};

/**
 * Висящие приглашения: не приняты, не отозваны и срок не вышел. Свежие первыми.
 *
 * Просроченные не показываются: по ним учётку уже не завести, и отзывать их незачем.
 */
export const listPendingEmployeeInvites = async (
  now: Date,
  client: Executor = db,
): Promise<PendingEmployeeInviteRow[]> =>
  client.$queryRaw<PendingEmployeeInviteRow[]>`
    SELECT invite."id",
           invite."role",
           invite."full_name"  AS "fullName",
           invite."phone_e164" AS "phoneE164",
           invite."token",
           inviter."full_name" AS "invitedByName",
           invite."created_at" AS "createdAt",
           invite."expires_at" AS "expiresAt"
      FROM xb.employee_invites AS invite
      JOIN xb.employees        AS inviter ON inviter."id" = invite."invited_by_id"
     WHERE invite."accepted_at" IS NULL
       AND invite."revoked_at" IS NULL
       AND invite."expires_at" > ${now}
     ORDER BY invite."created_at" DESC
  `;
