import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';

/**
 * Доступ к приглашениям в демо (issue #252) — по образцу приглашений сотрудников.
 *
 * Поиск идёт по `sha256` от токена. Сам токен лежит рядом только у живого приглашения —
 * чтобы ссылку можно было скопировать, пока она работает (решение Руслана 27-09-2026);
 * принятие и отзыв его стирают, и это держит проверка `demo_invites_token_live_check`.
 */

type Executor = Prisma.TransactionClient;

export type DemoInviteRow = {
  id: string;
  label: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

export type InsertDemoInviteInput = {
  label: string;
  token: string;
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
};

export const insertDemoInvite = async (
  input: InsertDemoInviteInput,
  client: Executor = db,
): Promise<DemoInviteRow> => {
  const rows = await client.$queryRaw<DemoInviteRow[]>`
    INSERT INTO xb.demo_invites ("label", "token", "token_hash", "invited_by_id", "expires_at")
    VALUES (${input.label}, ${input.token}, ${input.tokenHash}, ${input.invitedById}::uuid, ${input.expiresAt})
    RETURNING "id",
              "label",
              "expires_at"  AS "expiresAt",
              "accepted_at" AS "acceptedAt",
              "revoked_at"  AS "revokedAt"
  `;

  const invite = rows[0];

  if (!invite) {
    throw new Error('вставка приглашения в демо не вернула строку');
  }

  return invite;
};

/**
 * Приглашение по хешу токена — с блокировкой строки: принятие решает по ней и пишет в неё
 * одной транзакцией, и два одновременных `/start` одной ссылки идут друг за другом, а второй
 * видит её уже принятой.
 */
export const lockDemoInviteByTokenHash = async (
  tokenHash: string,
  client: Executor,
): Promise<DemoInviteRow | null> => {
  const rows = await client.$queryRaw<DemoInviteRow[]>`
    SELECT "id",
           "label",
           "expires_at"  AS "expiresAt",
           "accepted_at" AS "acceptedAt",
           "revoked_at"  AS "revokedAt"
      FROM xb.demo_invites
     WHERE "token_hash" = ${tokenHash}
       FOR UPDATE
  `;

  return rows[0] ?? null;
};

export const markDemoInviteAccepted = async (
  inviteId: string,
  telegramUserId: bigint,
  acceptedAt: Date,
  client: Executor,
): Promise<void> => {
  await client.$executeRaw`
    UPDATE xb.demo_invites
       SET "accepted_at"               = ${acceptedAt},
           "accepted_telegram_user_id" = ${telegramUserId.toString()}::text::bigint,
           "token"                     = NULL
     WHERE "id" = ${inviteId}::uuid
  `;
};

/**
 * Отзывает приглашение — только непринятое и неотозванное. Условие в самом `UPDATE`: между
 * чтением и записью помещается принятие ссылки тем, кто её уже открыл. `false` — приглашения
 * нет или отзывать нечего.
 */
export const markDemoInviteRevoked = async (
  inviteId: string,
  revokedAt: Date,
  client: Executor = db,
): Promise<boolean> => {
  const updated = await client.$executeRaw`
    UPDATE xb.demo_invites
       SET "revoked_at" = ${revokedAt},
           "token"      = NULL
     WHERE "id" = ${inviteId}::uuid
       AND "accepted_at" IS NULL
       AND "revoked_at" IS NULL
  `;

  return updated === 1;
};

export const demoInviteExists = async (inviteId: string, client: Executor = db): Promise<boolean> => {
  const rows = await client.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM xb.demo_invites WHERE "id" = ${inviteId}::uuid
  `;

  return rows.length > 0;
};

export type LiveDemoInviteRow = DemoInviteRow & {
  /** Пусто у выпущенных до колонки `token`: их ссылку не восстановить. */
  token: string | null;
};

/** Живые приглашения: не приняты, не отозваны, срок не вышел. Свежие первыми. */
export const listLiveDemoInvites = async (now: Date, client: Executor = db): Promise<LiveDemoInviteRow[]> =>
  client.$queryRaw<LiveDemoInviteRow[]>`
    SELECT "id",
           "label",
           "token",
           "expires_at"  AS "expiresAt",
           "accepted_at" AS "acceptedAt",
           "revoked_at"  AS "revokedAt"
      FROM xb.demo_invites
     WHERE "accepted_at" IS NULL
       AND "revoked_at" IS NULL
       AND "expires_at" > ${now}
     ORDER BY "created_at" DESC
  `;
