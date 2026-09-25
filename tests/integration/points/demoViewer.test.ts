import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { addDemoViewer } from '#server/services/demo/addDemoViewer';
import { disableDemoViewer } from '#server/services/demo/disableDemoViewer';
import { buildOpeningIdempotencyKey } from '#server/services/points/idempotencyKey';
import {
  cleanupTestData,
  countTransfersByKey,
  countTransfersByReason,
  createTestPerson,
  disconnectDatabase,
  readAccountBalance,
} from '../support/database';
import { cleanupTestDemo, trackTestDemoViewer } from '../support/demo';
import { cleanupTestEmployees, linkTestDriver, nextTestTelegramUserId } from '../support/employees';
import { grantPoints } from '../support/points';
import { disconnectQueues } from '../support/queues';

/**
 * Демо-водитель (issue #205): баланс ложится переводом `opening` с `emission`, ровно один раз
 * на демо-водителя, сколько бы раз зрителя ни вносили и ни выключали.
 *
 * Источник — участник с самым большим балансом, и база общая с разведкой: фикстура получает
 * баланс заведомо больше любого живого, чтобы источником стала она, а не случайный человек
 * из локальной копии.
 */

/** Больше любого баланса в парке — источником станет фикстура. */
const SOURCE_BALANCE = 50_000_000;

type LinkRow = { closedAt: Date | null; closeReason: string | null; confirmedBy: string };

const readDemoLinks = (personId: string): Promise<LinkRow[]> =>
  db.$queryRaw<LinkRow[]>`
    SELECT "closed_at" AS "closedAt", "close_reason"::text AS "closeReason", "confirmed_by"::text AS "confirmedBy"
      FROM xb.telegram_links
     WHERE "person_id" = ${personId}::uuid
     ORDER BY "linked_at"
  `;

/** Участник-источник: в программе, с активной привязкой и самым большим балансом. */
const createSource = async (): Promise<void> => {
  const source = await createTestPerson({ inProgram: true });

  await linkTestDriver(source.personId, nextTestTelegramUserId());
  await grantPoints(source.personId, SOURCE_BALANCE);
};

/** Вносит зрителя и отдаёт его демо-водителя уборке. */
const addViewer = async (telegramUserId: bigint, label: string) => {
  const result = await addDemoViewer({ telegramUserId, label });

  if ('personId' in result) {
    trackTestDemoViewer(telegramUserId, result.personId);
  }

  return result;
};

describe('демо-водитель', () => {
  afterEach(async () => {
    await cleanupTestDemo();
    await cleanupTestEmployees();
    await cleanupTestData();
  });
  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('получает баланс источника одним переводом opening с эмиссии', async () => {
    await createSource();
    const telegramUserId = nextTestTelegramUserId();

    const result = await addViewer(telegramUserId, 'проверка');

    expect(result.outcome).toBe('created');

    if (result.outcome !== 'created') {
      return;
    }

    expect(result.balance).toBe(BigInt(SOURCE_BALANCE));
    expect(await readAccountBalance(result.personId)).toBe(BigInt(SOURCE_BALANCE));
    expect(await countTransfersByKey(buildOpeningIdempotencyKey(result.personId))).toBe(1);
    expect(await countTransfersByReason(result.personId, 'opening')).toBe(1);

    const [link] = await readDemoLinks(result.personId);

    expect(link).toEqual({ closedAt: null, closeReason: null, confirmedBy: 'demo' });
  });

  it('повторное внесение не заводит второго водителя и не переносит баланс второй раз', async () => {
    await createSource();
    const telegramUserId = nextTestTelegramUserId();

    const first = await addViewer(telegramUserId, 'проверка');
    const again = await addViewer(telegramUserId, 'новая подпись');

    expect(first.outcome).toBe('created');
    expect(again.outcome).toBe('label_updated');

    if (first.outcome !== 'created' || again.outcome !== 'label_updated') {
      return;
    }

    expect(again.personId).toBe(first.personId);
    expect(await countTransfersByReason(first.personId, 'opening')).toBe(1);
  });

  it('выключение закрывает привязку, повторное внесение возвращает того же водителя', async () => {
    await createSource();
    const telegramUserId = nextTestTelegramUserId();

    const first = await addViewer(telegramUserId, 'проверка');

    expect(first.outcome).toBe('created');

    if (first.outcome !== 'created') {
      return;
    }

    expect(await disableDemoViewer(telegramUserId)).toEqual({ outcome: 'disabled', personId: first.personId });

    const [closed] = await readDemoLinks(first.personId);

    expect(closed?.closedAt).not.toBeNull();
    expect(closed?.closeReason).toBe('demo');

    const enabled = await addViewer(telegramUserId, 'проверка');

    expect(enabled).toEqual({ outcome: 'enabled', personId: first.personId, balance: BigInt(SOURCE_BALANCE) });
    expect((await readDemoLinks(first.personId)).map((link) => link.closedAt === null)).toEqual([false, true]);
    expect(await countTransfersByReason(first.personId, 'opening')).toBe(1);
  });

  it('Telegram живого участника зрителем не становится', async () => {
    await createSource();
    const member = await createTestPerson({ inProgram: true });
    const telegramUserId = nextTestTelegramUserId();

    await linkTestDriver(member.personId, telegramUserId);

    expect(await addViewer(telegramUserId, 'проверка')).toEqual({ outcome: 'telegram_linked' });
  });
});
