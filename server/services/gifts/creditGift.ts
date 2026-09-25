import { consola } from 'consola';
import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import type { GiftClaimMode } from '#server/generated/prisma/enums';
import { lockGiftReward, markGiftCredited, type LockedGiftRow } from '#server/repositories/gifts';
import { findDriverAccountByPerson } from '#server/repositories/points';
import { GiftNotClaimableError, GiftNotFoundError } from '#server/services/gifts/errors';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import {
  buildCampaignIdempotencyKey,
  buildGiftCampaignSlug,
} from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';

/**
 * Зачисление подарка от Xalq Taxi (issue #219) — **единственное место**, где подарок
 * ложится на баланс: нажатием «Забрать» (`claimGift`) и по сроку (`creditDueGifts`).
 *
 * Одна транзакция: перевод `emission` → водитель причиной `campaign` с ключом
 * `campaign:gift-<gift_grants.id>:<persons.id>` (docs/points.md → «массовое начисление
 * по кампании»), статус `credited`, момент и способ зачисления. Журнал без статуса —
 * это подарок, зачисленный дважды: второй раз по сроку; статус без журнала — «на балансе»
 * без баллов.
 *
 * Подарок берётся под блокировку первым, поэтому нажатие и прогон по сроку, пришедшие
 * разом, идут по очереди, и второй видит уже `credited`. Если же перевод по ключу уже есть,
 * а подарок почему-то ждёт, второго начисления нет: ключ отсекает его в базе, подарок
 * отмечается зачисленным и исход называется «уже зачислено» — журнал здесь главнее статуса.
 */

const log = consola.withTag('gifts:credit');

type Transaction = Prisma.TransactionClient;

export type CreditGiftResult = {
  /** `already_credited` — перевод по ключу был раньше, баланс этим вызовом не тронут. */
  outcome: 'credited' | 'already_credited';
  /** Баланс водителя после зачисления. */
  balance: bigint;
};

const creditLockedGift = async (
  transaction: Transaction,
  gift: LockedGiftRow,
  mode: GiftClaimMode,
): Promise<CreditGiftResult> => {
  // Участник программы получил подарок при раздаче, но счёта у него могло ещё не быть:
  // счёт заводится первым начислением.
  const driverAccount = await ensureDriverAccount(gift.personId, transaction);
  const emissionAccount = await getSystemAccount('emission');
  const now = new Date();

  const { applied } = await transferPoints({
    reason: 'campaign',
    idempotencyKey: buildCampaignIdempotencyKey(buildGiftCampaignSlug(gift.giftGrantId), gift.personId),
    amount: gift.points,
    fromAccountId: emissionAccount.id,
    toAccountId: driverAccount.id,
    occurredAt: now,
    context: { actor: mode === 'driver' ? 'gift_claim' : 'gift_auto' },
    client: transaction,
  });

  if (!applied) {
    log.warn('перевод подарка по ключу уже был — второго начисления нет', {
      rewardId: gift.id,
      giftGrantId: gift.giftGrantId,
    });
  }

  if ((await markGiftCredited(transaction, gift.id, mode, now)) !== 1) {
    throw new Error(`зачисление подарка ${gift.id} не изменило ни одной строки`);
  }

  const account = await findDriverAccountByPerson(gift.personId, transaction);

  if (!account) {
    throw new Error(`водительский счёт человека ${gift.personId} исчез внутри зачисления`);
  }

  return { outcome: applied ? 'credited' : 'already_credited', balance: account.balance };
};

/**
 * «Забрать» в Mini App. Чужой и несуществующий подарок — один отказ: водителю незачем
 * узнавать, что по чужому идентификатору что-то есть.
 */
export const claimGift = async (rewardId: string, personId: string): Promise<CreditGiftResult> => {
  const result = await db.$transaction(async (transaction) => {
    const gift = await lockGiftReward(transaction, rewardId);

    if (!gift || gift.personId !== personId) {
      throw new GiftNotFoundError(rewardId);
    }

    if (gift.status !== 'claimable') {
      throw new GiftNotClaimableError(rewardId);
    }

    return creditLockedGift(transaction, gift, 'driver');
  });

  log.info('подарок забран', { rewardId, personId, outcome: result.outcome });

  return result;
};

/**
 * Зачисление по сроку одного подарка. `false` — он уже не ждёт: водитель забрал его сам
 * между выборкой и зачислением.
 */
export const creditGiftByDeadline = async (rewardId: string): Promise<boolean> =>
  db.$transaction(async (transaction) => {
    const gift = await lockGiftReward(transaction, rewardId);

    if (!gift || gift.status !== 'claimable') {
      return false;
    }

    await creditLockedGift(transaction, gift, 'auto');

    return true;
  });
