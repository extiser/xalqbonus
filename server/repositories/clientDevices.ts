import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import type { ClientPlatform } from '#server/generated/prisma/enums';

/**
 * Лог устройств Mini App (issue #223): строка на сочетание Telegram-аккаунта и строки браузера.
 *
 * Схема в сыром SQL указывается явно — `xb.client_devices`: `?schema=xb` в строке подключения
 * понимает Prisma, а не `pg` (docs/decisions.md → «В сыром SQL схема указывается явно»).
 */

type Executor = Prisma.TransactionClient;

export type ClientDeviceVisit = {
  telegramUserId: bigint;
  userAgent: string;
  platform: ClientPlatform;
  osVersion: string | null;
  engineVersion: number | null;
  botApiVersion: string | null;
  engineOk: boolean;
};

/**
 * Записывает вход: новая строка — первым входом, известная — ещё одним.
 *
 * Одним `INSERT … ON CONFLICT`, а не чтением и записью: две вкладки, открытые разом, иначе
 * завели бы по строке каждая или потеряли бы вход. Защита — уникальный индекс, не порядок
 * действий (docs/principles.md → «Идемпотентность вместо аккуратности»).
 *
 * Версии ОС и движка у известной строки не переписываются: они разобраны из той же строки
 * браузера, по которой строка и найдена. Платформа, версия Bot API и итог проверки — последние:
 * Telegram обновляется отдельно от браузера.
 */
export const recordClientDeviceVisit = async (
  visit: ClientDeviceVisit,
  client: Executor = db,
): Promise<void> => {
  await client.$executeRaw`
    INSERT INTO xb.client_devices (
      "telegram_user_id", "user_agent", "platform", "os_version", "engine_version",
      "bot_api_version", "engine_ok", "first_seen_at", "last_seen_at", "visits"
    )
    VALUES (
      ${visit.telegramUserId}, ${visit.userAgent}, ${visit.platform}::xb.client_platform,
      ${visit.osVersion}, ${visit.engineVersion}::integer, ${visit.botApiVersion},
      ${visit.engineOk}, now(), now(), 1
    )
    ON CONFLICT ("telegram_user_id", "user_agent") DO UPDATE
       SET "visits"          = client_devices."visits" + 1,
           "last_seen_at"    = now(),
           "platform"        = EXCLUDED."platform",
           "bot_api_version" = EXCLUDED."bot_api_version",
           "engine_ok"       = EXCLUDED."engine_ok"
  `;
};

export type PersonDeviceRow = {
  id: string;
  platform: ClientPlatform;
  osVersion: string | null;
  engineVersion: number | null;
  botApiVersion: string | null;
  engineOk: boolean;
  userAgent: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  visits: number;
};

/**
 * Устройства всех Telegram-аккаунтов человека — по привязкам, открытым и закрытым: водитель,
 * перепривязавший аккаунт, заходил и со старого, и это тоже его история. Свежие входы первыми.
 */
export const listPersonDevices = async (
  personId: string,
  limit: number,
  client: Executor = db,
): Promise<PersonDeviceRow[]> =>
  client.$queryRaw<PersonDeviceRow[]>`
    SELECT device."id",
           device."platform",
           device."os_version"      AS "osVersion",
           device."engine_version"  AS "engineVersion",
           device."bot_api_version" AS "botApiVersion",
           device."engine_ok"       AS "engineOk",
           device."user_agent"      AS "userAgent",
           device."first_seen_at"   AS "firstSeenAt",
           device."last_seen_at"    AS "lastSeenAt",
           device."visits"
      FROM xb.client_devices AS device
     WHERE device."telegram_user_id" IN (
             SELECT link."telegram_chat_id"
               FROM xb.telegram_links AS link
              WHERE link."person_id" = ${personId}::uuid
           )
     ORDER BY device."last_seen_at" DESC
     LIMIT ${limit}
  `;
