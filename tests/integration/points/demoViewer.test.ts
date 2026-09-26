import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { addDemoViewer, DEMO_DRIVER_OPENING_BALANCE } from '#server/services/demo/addDemoViewer';
import { disableDemoViewer } from '#server/services/demo/disableDemoViewer';
import { readBalanceTotals, readOpeningTotal } from '#server/repositories/points';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import {
  buildDemoGrantIdempotencyKey,
  buildOpeningIdempotencyKey,
} from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';
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
 * Демо-водитель (issue #205): баланс `DEMO_DRIVER_OPENING_BALANCE` ложится переводом `demo_grant`
 * с `emission`, ровно один раз на демо-водителя, сколько бы раз зрителя ни вносили и ни выключали.
 *
 * У источника берутся только условия работы профиля, и баланс у него не нужен: фикстура — участник
 * с работающим профилем и активной привязкой, свежим по отметке API.
 */

const OPENING_BALANCE = BigInt(DEMO_DRIVER_OPENING_BALANCE);

type LinkRow = { closedAt: Date | null; closeReason: string | null; confirmedBy: string };

const readDemoLinks = (personId: string): Promise<LinkRow[]> =>
  db.$queryRaw<LinkRow[]>`
    SELECT "closed_at" AS "closedAt", "close_reason"::text AS "closeReason", "confirmed_by"::text AS "confirmedBy"
      FROM xb.telegram_links
     WHERE "person_id" = ${personId}::uuid
     ORDER BY "linked_at"
  `;

/** Участник-источник: в программе, с активной привязкой и работающим профилем. */
const createSource = async (): Promise<void> => {
  const source = await createTestPerson({ inProgram: true });

  await linkTestDriver(source.personId, nextTestTelegramUserId());
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

  it('получает фиксированный баланс одним переводом demo_grant с эмиссии', async () => {
    await createSource();
    const telegramUserId = nextTestTelegramUserId();

    const result = await addViewer(telegramUserId, 'проверка');

    expect(result.outcome).toBe('created');

    if (result.outcome !== 'created') {
      return;
    }

    expect(result.balance).toBe(OPENING_BALANCE);
    expect(await readAccountBalance(result.personId)).toBe(OPENING_BALANCE);
    expect(await countTransfersByKey(buildDemoGrantIdempotencyKey(result.personId))).toBe(1);
    expect(await countTransfersByReason(result.personId, 'demo_grant')).toBe(1);

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
    expect(await countTransfersByReason(first.personId, 'demo_grant')).toBe(1);
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

    expect(enabled).toEqual({ outcome: 'enabled', personId: first.personId, balance: OPENING_BALANCE });
    expect((await readDemoLinks(first.personId)).map((link) => link.closedAt === null)).toEqual([false, true]);
    expect(await countTransfersByReason(first.personId, 'demo_grant')).toBe(1);
  });

  it('итоги переноса не считают демо: ни заведение, ни правку, ни прежний opening', async () => {
    await createSource();

    const totalsBefore = await readBalanceTotals();
    const openingBefore = await readOpeningTotal();

    const result = await addViewer(nextTestTelegramUserId(), 'проверка итогов');

    if (result.outcome !== 'created') {
      throw new Error(`демо-водитель не заведён: ${result.outcome}`);
    }

    // Правка баллов демо-водителю — той же причиной `manual`, что у ручной правки.
    await grantPoints(result.personId, 700);

    // Демо-водитель, заведённый до `demo_grant`, — с переводом `opening`.
    const legacyDemo = await createTestPerson({ inProgram: true });

    await db.$executeRaw`UPDATE xb.persons SET "is_demo" = true WHERE "id" = ${legacyDemo.personId}::uuid`;

    const account = await ensureDriverAccount(legacyDemo.personId);
    const emission = await getSystemAccount('emission');

    await transferPoints({
      reason: 'opening',
      idempotencyKey: buildOpeningIdempotencyKey(legacyDemo.personId),
      amount: 300,
      fromAccountId: emission.id,
      toAccountId: account.id,
      occurredAt: new Date(),
    });

    expect(await readBalanceTotals()).toEqual(totalsBefore);
    expect(await readOpeningTotal()).toBe(openingBefore);
  });

  it('Telegram живого участника зрителем не становится', async () => {
    await createSource();
    const member = await createTestPerson({ inProgram: true });
    const telegramUserId = nextTestTelegramUserId();

    await linkTestDriver(member.personId, telegramUserId);

    expect(await addViewer(telegramUserId, 'проверка')).toEqual({ outcome: 'telegram_linked' });
  });
});
