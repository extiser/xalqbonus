import { consola } from 'consola';
import { db } from '#server/db';
import {
  lockAwaitingRewardById,
  markRewardIssued,
} from '#server/repositories/rewards';
import { lockStockRows, writeStockMovement } from '#server/repositories/stock';
import { RewardNotAwaitingError } from '#server/services/rewards/errors';

/**
 * Выдача награды на стойке — одной транзакцией: статус `issued` с временем и сотрудником,
 * а у товара ещё и снятие резерва движением `reward_issue` — товар ушёл из офиса.
 * Переводов нет: у наград, ждущих в офисе, баллов не бывает.
 *
 * Награда берётся **по идентификатору**, а не по коду — тем же доводом, что у заказа: код
 * освобождается выдачей и может достаться новой награде, и выдача по коду, прочитанному
 * секундой раньше, выдала бы чужую.
 *
 * Открыт ли офис сотруднику, проверяет вызывающий (`issueOfficeReward`). Двойной тап штатен:
 * второе нажатие не находит ждущей награды и получает `RewardNotAwaitingError`, не сделав
 * ни одной записи; две выдачи разом разводит блокировка строки.
 */

const log = consola.withTag('rewards:issue');

export type IssueRewardInput = {
  rewardId: string;
  employeeId: string;
};

export const issueReward = async (input: IssueRewardInput): Promise<{ issuedAt: Date }> =>
  db.$transaction(async (transaction) => {
    const reward = await lockAwaitingRewardById(transaction, input.rewardId);

    if (!reward) {
      throw new RewardNotAwaitingError(input.rewardId, null);
    }

    // Порядок блокировок — награда, затем остаток: строка награды уже взята выше, строка
    // остатка берётся здесь, до записи статуса. С рождением он не встречается: `grantReward`
    // существующую награду не блокирует, а вставляет новую, и общая у них только строка
    // остатка — дедлоку не на чем сложиться. Сгорание берёт строки тем же порядком.
    if (reward.kind === 'product' && reward.officeId && reward.productId) {
      await lockStockRows(transaction, reward.officeId, [reward.productId]);
    }

    const issuedAt = new Date();
    const updated = await markRewardIssued(transaction, reward.id, input.employeeId, issuedAt);

    // Недостижимо под блокировкой строки — см. то же место в `issueOrder`.
    if (updated !== 1) {
      throw new Error(`выдача награды ${reward.id} не изменила ни одной строки`);
    }

    if (reward.kind === 'product' && reward.officeId && reward.productId) {
      await writeStockMovement(transaction, {
        officeId: reward.officeId,
        productId: reward.productId,
        kind: 'reward_issue',
        deltaOnHand: 0,
        deltaReserved: -1,
        rewardId: reward.id,
        employeeId: input.employeeId,
      });
    }

    log.info('награда выдана на стойке', {
      rewardId: reward.id,
      kind: reward.kind,
      officeId: reward.officeId,
    });

    return { issuedAt };
  });
