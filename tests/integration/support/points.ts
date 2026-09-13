import { randomUUID } from 'node:crypto';

import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import { buildManualIdempotencyKey } from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';

/**
 * Выдаёт водителю баллы для сценариев, которые их тратят.
 *
 * Настоящим переводом с эмиссионного счёта, а не `UPDATE accounts`: прямая правка баланса
 * мимо журнала — то самое, что ловит второй инвариант, и тест заказа не должен оставлять
 * после себя расхождение, которое потом придётся отличать от настоящего.
 *
 * Причина `manual` со случайным ключом: раздача ради фикстуры — это ровно одна операция
 * по одному человеку, заведённая «оператором», и ключ у неё не значит ничего.
 */
export const grantPoints = async (personId: string, amount: number): Promise<string> => {
  const driverAccount = await ensureDriverAccount(personId);
  const emissionAccount = await getSystemAccount('emission');

  await transferPoints({
    reason: 'manual',
    idempotencyKey: buildManualIdempotencyKey(randomUUID()),
    amount,
    fromAccountId: emissionAccount.id,
    toAccountId: driverAccount.id,
    occurredAt: new Date(),
  });

  return driverAccount.id;
};
