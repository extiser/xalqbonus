import { readFileSync } from 'node:fs';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { registerDriverByContact } from '#server/services/drivers/registerDriverByContact';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import {
  cleanupTestEmployees,
  createTestEmployee,
  linkTestDriver,
  nextTestPhone,
  nextTestTelegramUserId,
  setTestProfilePhone,
} from '../support/employees';
import { disconnectQueues } from '../support/queues';

/**
 * Вторая сторона правила «водителем и сотрудником одновременно быть нельзя»: сотрудник,
 * приславший боту контакт как водитель, получает отказ, а не вторую роль.
 *
 * Плюс запрос о пересечении ролей из scripts/invariants.sql — того же файла, который гоняет
 * `make invariants`. Своя копия запроса разошлась бы с оригиналом на первой правке,
 * и проверка начала бы проверять не то, что команда.
 */

const INVARIANTS_PATH = new URL('../../../scripts/invariants.sql', import.meta.url);

const readCrossRoleQuery = (): string => {
  const source = readFileSync(INVARIANTS_PATH, 'utf8');
  const block = /-- cross-role:begin\n([\s\S]*?)\n-- cross-role:end/.exec(source);

  if (!block?.[1]) {
    throw new Error('в scripts/invariants.sql нет запроса о пересечении ролей');
  }

  return block[1].trim();
};

/**
 * Попытки привязки, записанные тестом, убираются по чату: журнал попыток внешних ключей
 * не имеет, и уборка по людям до него не доходит.
 */
const cleanupAttemptsByChat = async (telegramChatId: bigint): Promise<void> => {
  await db.$executeRaw`
    DELETE FROM xb.telegram_link_attempts
     WHERE "telegram_chat_id" = ${telegramChatId.toString()}::text::bigint
  `;
};

describe('пересечение ролей', () => {
  const usedChatIds: bigint[] = [];

  afterEach(async () => {
    for (const chatId of usedChatIds.splice(0)) {
      await cleanupAttemptsByChat(chatId);
    }

    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('контакт сотрудника даёт исход employee_account, а не привязку водителя', async () => {
    const telegramUserId = nextTestTelegramUserId();
    const phone = nextTestPhone();

    await createTestEmployee({ role: 'manager', phoneE164: phone, telegramUserId });
    usedChatIds.push(telegramUserId);

    const result = await registerDriverByContact({
      telegramChatId: telegramUserId,
      telegramUserId,
      contactUserId: telegramUserId,
      phoneRaw: phone,
      language: 'ru',
    });

    expect(result.outcome).toBe('employee_account');

    // Исход записан в журнал попыток наравне с остальными: отказ без записи неотличим
    // от «водитель не приходил».
    const attempts = await db.$queryRaw<{ outcome: string }[]>`
      SELECT "outcome"::text AS "outcome"
        FROM xb.telegram_link_attempts
       WHERE "telegram_chat_id" = ${telegramUserId.toString()}::text::bigint
    `;

    expect(attempts).toEqual([{ outcome: 'employee_account' }]);
  });

  it('сотрудник, известный только по телефону, водителем тоже не становится', async () => {
    const phone = nextTestPhone();
    const chatId = nextTestTelegramUserId();

    // Telegram у сотрудника свой, и с присланным контактом он не совпадает: пересечение
    // здесь идёт по одному телефону.
    await createTestEmployee({ role: 'admin', phoneE164: phone });
    usedChatIds.push(chatId);

    const result = await registerDriverByContact({
      telegramChatId: chatId,
      telegramUserId: chatId,
      contactUserId: chatId,
      phoneRaw: phone,
      language: 'ru',
    });

    expect(result.outcome).toBe('employee_account');
  });

  it('запрос инвариантов молчит на чистых данных и показывает подстроенное пересечение', async () => {
    const query = readCrossRoleQuery();

    expect(await db.$queryRawUnsafe(query)).toEqual([]);

    // Пересечение заводится мимо кода — ровно то, что инвариант обязан поймать, если
    // проверку с обеих сторон однажды сломают рефакторингом.
    const driver = await createTestPerson({ inProgram: true });
    const telegramUserId = nextTestTelegramUserId();

    await linkTestDriver(driver.personId, telegramUserId, telegramUserId);
    await createTestEmployee({ role: 'manager', telegramUserId });

    expect(await db.$queryRawUnsafe(query)).toHaveLength(1);
  });

  it('инвариант ловит пересечение и по телефону, а не только по Telegram', async () => {
    const query = readCrossRoleQuery();
    const driver = await createTestPerson({ inProgram: true });
    const phone = nextTestPhone();
    const driverChatId = nextTestTelegramUserId();

    await setTestProfilePhone(driver.profileId, phone);
    await linkTestDriver(driver.personId, driverChatId, driverChatId);
    await createTestEmployee({ role: 'manager', phoneE164: phone });

    expect(await db.$queryRawUnsafe(query)).toHaveLength(1);
  });
});
