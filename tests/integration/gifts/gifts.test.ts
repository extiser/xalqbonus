import { randomInt, randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { readMemberHistory } from '#server/services/drivers/readMemberHistory';
import { creditDueGifts } from '#server/services/gifts/creditDueGifts';
import { claimGift } from '#server/services/gifts/creditGift';
import { GiftNotClaimableError, GiftNotFoundError } from '#server/services/gifts/errors';
import { grantGift } from '#server/services/gifts/grantGift';
import { markGiftsShown } from '#server/services/gifts/markGiftsShown';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import {
  buildCampaignIdempotencyKey,
  buildGiftCampaignSlug,
} from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';
import { readMemberRewards } from '#server/services/rewards/readMemberRewards';
import { createSegment } from '#server/services/segments/createSegment';
import { setSegmentArchived } from '#server/services/segments/setSegmentArchived';
import { parkDayKey, shiftDayKey } from '#server/utils/parkTime';
import {
  cleanupTestData,
  countTransfersByKey,
  createTestPerson,
  disconnectDatabase,
  readAccountBalance,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { expireTestGift, findGiftRewardId, readGift, readGiftGrantCounters } from '../support/gifts';
import { grantPoints } from '../support/points';
import { disconnectQueues } from '../support/queues';
import { cleanupTestSegments, trackTestSegment } from '../support/segments';

/**
 * Подарки от Xalq Taxi (issue #219): раздача, «Забрать» и зачисление по сроку — через
 * сервисы, тем путём, которым их зовут ручки и воркер.
 *
 * Это ядро начисления (docs/infra.md → «Тесты»): подарок ложится на баланс переводом
 * в журнал, и главное здесь — что до зачисления его на балансе нет, а повтор ключа
 * `campaign:gift-<id>:<person>` второго начисления не даёт. Проверяется настоящей базой:
 * повтор отсекает уникальное ограничение, и заглушка подтвердила бы код, а не правило.
 */

/** Далёкий день «Забрать до»: подарок ждёт, пока тест не сдвинет срок сам. */
const FAR_UNTIL_DATE = '2099-01-01';

const giftKey = (giftGrantId: string, personId: string): string =>
  buildCampaignIdempotencyKey(buildGiftCampaignSlug(giftGrantId), personId);

/** Участник программы со счётом и заданным балансом. */
const createMember = async (balance: number): Promise<string> => {
  const { personId } = await createTestPerson({ inProgram: true });

  await grantPoints(personId, balance);

  return personId;
};

const createOwner = async (): Promise<string> => (await createTestEmployee({ role: 'owner' })).employeeId;

/** Подарок одному водителю: раздача и идентификатор его награды. */
const giftTo = async (personId: string, employeeId: string, points = 300) => {
  const granted = await grantGift({
    recipient: { kind: 'person', personId },
    points,
    reasonRu: 'ко Дню учителя',
    reasonUz: "O'qituvchilar kuni munosabati bilan",
    messageRu: '',
    messageUz: '',
    coverRu: null,
    coverUz: null,
    sendNow: false,
    untilDate: FAR_UNTIL_DATE,
    employeeId,
  });

  return { ...granted, rewardId: await findGiftRewardId(granted.giftGrantId, personId) };
};

describe('подарки от Xalq Taxi', () => {
  // Раздача ссылается на сегмент и сотрудника: люди и раздачи первыми, сегменты и учётки следом.
  afterEach(async () => {
    await cleanupTestData();
    await cleanupTestSegments();
    await cleanupTestEmployees();
  });
  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('раздача сегменту: подарки ждут, баланс не меняется, не-участники пропущены', async () => {
    // Баланс — метка состава: сегмент берёт ровно этих людей и никого из чужих тестов.
    const marker = 900_000_000 + randomInt(1_000_000);
    const first = await createMember(marker);
    const second = await createMember(marker);
    const outsider = (await createTestPerson({ inProgram: false })).personId;

    await grantPoints(outsider, marker);

    const employeeId = await createOwner();
    const segment = await createSegment(
      {
        name: 'Тест подарков',
        description: null,
        conditions: {
          daysSinceTripMin: null,
          daysSinceTripMax: null,
          programMember: null,
          telegramLinked: null,
          balanceMin: BigInt(marker),
          balanceMax: BigInt(marker),
        },
      },
      employeeId,
      false,
    );
    trackTestSegment(segment.segmentId);

    const granted = await grantGift({
      recipient: { kind: 'segment', segmentId: segment.segmentId },
      points: 500,
      reasonRu: 'ко Дню независимости',
      reasonUz: 'ко Дню независимости',
      messageRu: '',
      messageUz: '',
      coverRu: null,
      coverUz: null,
      sendNow: false,
      untilDate: FAR_UNTIL_DATE,
      employeeId,
    });

    expect(granted).toMatchObject({ recipients: 2, skipped: 1 });
    expect(await readGiftGrantCounters(granted.giftGrantId)).toEqual({ recipients: 2, skipped: 1, rewards: 2 });

    for (const personId of [first, second]) {
      const rewardId = await findGiftRewardId(granted.giftGrantId, personId);

      expect((await readGift(rewardId))?.status).toBe('claimable');
      // Подарок до зачисления на балансе не лежит и в журнал не записан.
      expect(await readAccountBalance(personId)).toBe(BigInt(marker));
      expect(await countTransfersByKey(giftKey(granted.giftGrantId, personId))).toBe(0);
    }

    await expect(findGiftRewardId(granted.giftGrantId, outsider)).rejects.toThrow();
    expect(await readAccountBalance(outsider)).toBe(BigInt(marker));
  });

  it('«Забрать»: баланс растёт, статус credited, способ driver; повтор и чужой — отказ', async () => {
    const personId = await createMember(10);
    const stranger = await createMember(10);
    const employeeId = await createOwner();
    const { giftGrantId, rewardId } = await giftTo(personId, employeeId, 300);

    await expect(claimGift(rewardId, stranger)).rejects.toBeInstanceOf(GiftNotFoundError);
    await expect(claimGift(randomUUID(), personId)).rejects.toBeInstanceOf(GiftNotFoundError);

    const result = await claimGift(rewardId, personId);

    expect(result).toEqual({ outcome: 'credited', balance: 310n });
    expect(await readAccountBalance(personId)).toBe(310n);
    expect(await readGift(rewardId)).toMatchObject({ status: 'credited', claimMode: 'driver' });
    expect((await readGift(rewardId))?.claimedAt).toBeInstanceOf(Date);
    expect(await countTransfersByKey(giftKey(giftGrantId, personId))).toBe(1);

    // Повтор нажатия: подарок уже не ждёт — второго начисления нет.
    await expect(claimGift(rewardId, personId)).rejects.toBeInstanceOf(GiftNotClaimableError);
    expect(await readAccountBalance(personId)).toBe(310n);
    expect(await countTransfersByKey(giftKey(giftGrantId, personId))).toBe(1);
    expect(await readAccountBalance(stranger)).toBe(10n);
  });

  it('повтор ключа не даёт второго начисления: подарок отмечается зачисленным', async () => {
    const personId = await createMember(10);
    const employeeId = await createOwner();
    const { giftGrantId, rewardId } = await giftTo(personId, employeeId, 200);

    // Перевод по ключу подарка уже есть — так выглядит зачисление, чей статус не записался.
    const account = await ensureDriverAccount(personId);
    const emission = await getSystemAccount('emission');

    await transferPoints({
      reason: 'campaign',
      idempotencyKey: buildCampaignIdempotencyKey(buildGiftCampaignSlug(giftGrantId), personId),
      amount: 200,
      fromAccountId: emission.id,
      toAccountId: account.id,
      occurredAt: new Date(),
    });

    const result = await claimGift(rewardId, personId);

    expect(result).toEqual({ outcome: 'already_credited', balance: 210n });
    expect(await readAccountBalance(personId)).toBe(210n);
    expect(await countTransfersByKey(giftKey(giftGrantId, personId))).toBe(1);
    expect((await readGift(rewardId))?.status).toBe('credited');
  });

  it('по сроку зачисляется сам со способом auto; несрочный ждёт', async () => {
    const personId = await createMember(10);
    const employeeId = await createOwner();
    const due = await giftTo(personId, employeeId, 100);
    const later = await giftTo(personId, employeeId, 50);

    await expireTestGift(due.rewardId);

    const summary = await creditDueGifts();

    expect(summary.failed).toBe(0);
    expect(await readGift(due.rewardId)).toMatchObject({ status: 'credited', claimMode: 'auto' });
    expect((await readGift(later.rewardId))?.status).toBe('claimable');
    expect(await readAccountBalance(personId)).toBe(110n);

    // Второй прогон подарок не трогает: он уже зачислен.
    await creditDueGifts();
    expect(await readAccountBalance(personId)).toBe(110n);
    expect(await countTransfersByKey(giftKey(due.giftGrantId, personId))).toBe(1);
  });

  it('история: подарок — «Подарок от Xalq Taxi», акция — по-прежнему «Акция»', async () => {
    const personId = await createMember(10);
    const employeeId = await createOwner();
    const claimed = await giftTo(personId, employeeId, 300);
    const auto = await giftTo(personId, employeeId, 100);

    await claimGift(claimed.rewardId, personId);
    await expireTestGift(auto.rewardId);
    await creditDueGifts();

    const account = await ensureDriverAccount(personId);
    const emission = await getSystemAccount('emission');

    await transferPoints({
      reason: 'campaign',
      idempotencyKey: buildCampaignIdempotencyKey(`holiday-${randomInt(1_000_000)}`, personId),
      amount: 500,
      fromAccountId: emission.id,
      toAccountId: account.id,
      occurredAt: new Date(),
    });

    const { operations } = await readMemberHistory({ personId, language: 'ru', cursor: '' });
    const labels = operations.map((operation) => `${operation.reason} ${operation.delta}`);

    expect(labels).toContain('Подарок от Xalq Taxi 300');
    expect(labels).toContain('Подарок от Xalq Taxi 100');
    expect(labels).toContain('Акция 500');
  });

  it('Mini App: ждущие подарки своим списком, в общий не попадают; шторка отмечается', async () => {
    const personId = await createMember(10);
    const stranger = await createMember(10);
    const employeeId = await createOwner();
    const { rewardId } = await giftTo(personId, employeeId, 300);
    const foreign = await giftTo(stranger, employeeId, 300);

    const before = await readMemberRewards({ personId, language: 'ru' });

    expect(before.rewards).toEqual([]);
    expect(before.gifts).toEqual([
      {
        rewardId,
        title: '300 баллов в подарок',
        reasonText: 'Xalq Taxi · ко Дню учителя',
        deadlineText: 'Заберите до 1 января',
        coverUrl: null,
      },
    ]);
    expect(before.giftsUnseen).toBe(true);

    // Повод — на языке водителя.
    const uzbek = await readMemberRewards({ personId, language: 'uz' });

    expect(uzbek.gifts[0]?.reasonText).toBe("Xalq Taxi · O'qituvchilar kuni munosabati bilan");

    // Чужой идентификатор молча пропускается.
    await markGiftsShown(personId, [rewardId, foreign.rewardId]);

    expect((await readMemberRewards({ personId, language: 'ru' })).giftsUnseen).toBe(false);
    expect((await readGift(foreign.rewardId))?.giftShownAt).toBeNull();

    await claimGift(rewardId, personId);

    const after = await readMemberRewards({ personId, language: 'ru' });

    expect(after.gifts).toEqual([]);
    expect(after.rewards[0]).toMatchObject({
      rewardId,
      status: 'credited',
      title: '300 баллов',
      originText: 'Xalq Taxi · ко Дню учителя',
    });
    expect((await readMemberRewards({ personId, language: 'uz' })).rewards[0]?.originText).toBe(
      "Xalq Taxi · O'qituvchilar kuni munosabati bilan",
    );
  });

  it('отказы раздачи: вне программы, архивный сегмент, срок не позже сегодняшнего дня парка', async () => {
    const employeeId = await createOwner();
    const outsider = (await createTestPerson({ inProgram: false })).personId;
    const personId = await createMember(10);

    await expect(
      grantGift({
        recipient: { kind: 'person', personId: outsider },
        points: 100,
        reasonRu: 'повод',
        reasonUz: 'повод',
        messageRu: '',
        messageUz: '',
        coverRu: null,
        coverUz: null,
        sendNow: false,
        untilDate: FAR_UNTIL_DATE,
        employeeId,
      }),
    ).rejects.toMatchObject({ problem: 'person_not_member' });

    await expect(
      grantGift({
        recipient: { kind: 'person', personId },
        points: 100,
        reasonRu: 'повод',
        reasonUz: 'повод',
        messageRu: '',
        messageUz: '',
        coverRu: null,
        coverUz: null,
        sendNow: false,
        untilDate: parkDayKey(new Date()),
        employeeId,
      }),
    ).rejects.toMatchObject({ problem: 'until_date_too_early' });

    await expect(
      grantGift({
        recipient: { kind: 'person', personId },
        points: 0,
        reasonRu: 'повод',
        reasonUz: 'повод',
        messageRu: '',
        messageUz: '',
        coverRu: null,
        coverUz: null,
        sendNow: false,
        untilDate: FAR_UNTIL_DATE,
        employeeId,
      }),
    ).rejects.toMatchObject({ problem: 'points_invalid' });

    await expect(
      grantGift({
        recipient: { kind: 'person', personId },
        points: 100,
        reasonRu: '   ',
        reasonUz: 'sabab',
        messageRu: '',
        messageUz: '',
        coverRu: null,
        coverUz: null,
        sendNow: false,
        untilDate: FAR_UNTIL_DATE,
        employeeId,
      }),
    ).rejects.toMatchObject({ problem: 'reason_ru_missing' });

    await expect(
      grantGift({
        recipient: { kind: 'person', personId },
        points: 100,
        reasonRu: 'повод',
        reasonUz: '',
        messageRu: '',
        messageUz: '',
        coverRu: null,
        coverUz: null,
        sendNow: false,
        untilDate: FAR_UNTIL_DATE,
        employeeId,
      }),
    ).rejects.toMatchObject({ problem: 'reason_uz_missing' });

    // Повод — строка карточки подарка, не длиннее 60 знаков на каждом языке.
    await expect(
      grantGift({
        recipient: { kind: 'person', personId },
        points: 100,
        reasonRu: 'п'.repeat(61),
        reasonUz: 'sabab',
        messageRu: '',
        messageUz: '',
        coverRu: null,
        coverUz: null,
        sendNow: false,
        untilDate: FAR_UNTIL_DATE,
        employeeId,
      }),
    ).rejects.toMatchObject({ problem: 'reason_ru_too_long' });

    await expect(
      grantGift({
        recipient: { kind: 'person', personId },
        points: 100,
        reasonRu: 'повод',
        reasonUz: 'a'.repeat(61),
        messageRu: '',
        messageUz: '',
        coverRu: null,
        coverUz: null,
        sendNow: false,
        untilDate: FAR_UNTIL_DATE,
        employeeId,
      }),
    ).rejects.toMatchObject({ problem: 'reason_uz_too_long' });

    const segment = await createSegment(
      {
        name: 'Архивный',
        description: null,
        conditions: {
          daysSinceTripMin: null,
          daysSinceTripMax: null,
          programMember: true,
          telegramLinked: null,
          balanceMin: null,
          balanceMax: null,
        },
      },
      employeeId,
      false,
    );
    trackTestSegment(segment.segmentId);
    await setSegmentArchived(segment.segmentId, true);

    await expect(
      grantGift({
        recipient: { kind: 'segment', segmentId: segment.segmentId },
        points: 100,
        reasonRu: 'повод',
        reasonUz: 'повод',
        messageRu: '',
        messageUz: '',
        coverRu: null,
        coverUz: null,
        sendNow: false,
        untilDate: FAR_UNTIL_DATE,
        employeeId,
      }),
    ).rejects.toMatchObject({ problem: 'segment_archived' });

    // Завтрашний день парка — самый ранний годный.
    const tomorrow = await grantGift({
      recipient: { kind: 'person', personId },
      points: 100,
      // Ровно 60 знаков — годится.
      reasonRu: 'п'.repeat(60),
      reasonUz: 'a'.repeat(60),
      messageRu: '',
      messageUz: '',
      coverRu: null,
      coverUz: null,
      sendNow: false,
      untilDate: shiftDayKey(parkDayKey(new Date()), 1),
      employeeId,
    });

    expect(tomorrow.recipients).toBe(1);
  });
});
