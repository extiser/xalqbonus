import { consola } from 'consola';
import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import type { PointReason } from '#server/generated/prisma/enums';
import { findOffice } from '#server/repositories/offices';
import { findDriverAccountByPerson } from '#server/repositories/points';
import { findProduct } from '#server/repositories/products';
import { insertReward, type InsertRewardInput, type RewardRow } from '#server/repositories/rewards';
import { lockStockRows, writeStockMovement } from '#server/repositories/stock';
import { generateRewardCode } from '#server/services/orders/orderCode';
import { DriverAccountMissingError } from '#server/services/points/errors';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import type { IdempotencyKey } from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';
import {
  RewardCodeCollisionError,
  RewardOfficeUnavailableError,
  RewardPointsAlreadyCreditedError,
  RewardProductUnavailableError,
  RewardStockShortError,
} from '#server/services/rewards/errors';

/**
 * Рождение награды — **единственная дверь**, через которую награда появляется (issue #172).
 * Зовут её ручная выдача из админки и — следующей задачей — открытие сундука.
 *
 * Всё одной транзакцией, по виду награды:
 *
 * - **баллы** — перевод `emission` → водитель и строка `credited`. Причина и ключ
 *   идемпотентности приходят параметрами, а не выбираются здесь: у ручной выдачи это `manual`
 *   с ключом `manual:<uuid>`, у акции будет своя причина, и заводит её та задача
 * - **товар** — резерв штуки в офисе движением `reward_reserve` и строка `awaiting` с кодом
 *   и сроком. Резерв обязателен: без него товар обещан водителю, а на полке числится свободным
 *   и уедет другому. Свободного нет — `RewardStockShortError`, награда не заводится
 * - **произвольная** — строка `awaiting` с кодом и сроком, остаток не трогается: такой награды
 *   на складе нет
 *
 * Награду получает только участник программы — человек с водительским счётом. Вне программы
 * вручить её некуда: он не видит ни раздела, ни кода. Правило то же, что у ручной правки баллов.
 *
 * **Порядок блокировок** — как у оформления заказа: сначала строка остатка, потом счета
 * внутри перевода.
 */

const log = consola.withTag('rewards:grant');

/** Сколько кодов пробуем, прежде чем признать, что свободного не нашлось. Как у заказа. */
const CODE_ATTEMPTS = 3;

/** Что за награда. Офис и срок — только у тех, что ждут в офисе. */
export type RewardGift =
  | {
      kind: 'points';
      points: number;
      /** Причина перевода — решает вызывающий: у ручной выдачи `manual`. */
      reason: PointReason;
      idempotencyKey: IdempotencyKey;
    }
  | { kind: 'product'; productId: string; officeId: string; lifetimeDays: number }
  | { kind: 'custom'; title: string; officeId: string; lifetimeDays: number };

/** Почему выдаётся — то, что сотрудник увидит на карточке у стойки. */
export type RewardOrigin =
  | { source: 'manual'; employeeId: string; note: string }
  | { source: 'campaign'; campaignId: string; note: string | null };

export type GrantRewardInput = {
  personId: string;
  gift: RewardGift;
  origin: RewardOrigin;
};

type Transaction = Prisma.TransactionClient;

/** Поля строки, общие для всех видов: кто, почему и откуда. */
const originFields = (
  origin: RewardOrigin,
): Pick<InsertRewardInput, 'source' | 'campaignId' | 'sourceNote' | 'grantedByEmployeeId'> =>
  origin.source === 'manual'
    ? {
        source: 'manual',
        campaignId: null,
        sourceNote: origin.note,
        grantedByEmployeeId: origin.employeeId,
      }
    : {
        source: 'campaign',
        campaignId: origin.campaignId,
        sourceNote: origin.note,
        grantedByEmployeeId: null,
      };

const requireOpenOffice = async (transaction: Transaction, officeId: string): Promise<void> => {
  const office = await findOffice(officeId, transaction);

  if (!office || office.archivedAt !== null) {
    throw new RewardOfficeUnavailableError(officeId);
  }
};

/**
 * Вставляет награду, подбирая свободный код. Конфликт частичного индекса приходит пустым
 * результатом, а не исключением — см. `insertReward`.
 */
const insertAwaitingReward = async (
  transaction: Transaction,
  input: Omit<InsertRewardInput, 'code' | 'status'>,
): Promise<RewardRow> => {
  for (let attempt = 1; attempt <= CODE_ATTEMPTS; attempt += 1) {
    const reward = await insertReward(transaction, {
      ...input,
      code: generateRewardCode(),
      status: 'awaiting',
    });

    if (reward) {
      return reward;
    }

    log.warn('код награды занят ждущей наградой — пробуем другой', { attempt });
  }

  throw new RewardCodeCollisionError(CODE_ATTEMPTS);
};

const grantPoints = async (
  transaction: Transaction,
  input: GrantRewardInput,
  gift: Extract<RewardGift, { kind: 'points' }>,
  driverAccountId: string,
): Promise<RewardRow> => {
  const emissionAccount = await getSystemAccount('emission');

  const { applied } = await transferPoints({
    reason: gift.reason,
    idempotencyKey: gift.idempotencyKey,
    amount: gift.points,
    fromAccountId: emissionAccount.id,
    toAccountId: driverAccountId,
    occurredAt: new Date(),
    context: {
      actor: input.origin.source === 'manual' ? 'operator' : 'campaign',
      actorEmployeeId: input.origin.source === 'manual' ? input.origin.employeeId : null,
      note: input.origin.note,
    },
    client: transaction,
  });

  // Ключ уже был: баллы начислены раньше, и вторая строка награды рядом с единственным
  // начислением показала бы водителю вдвое больше, чем он получил.
  if (!applied) {
    throw new RewardPointsAlreadyCreditedError(gift.idempotencyKey);
  }

  const reward = await insertReward(transaction, {
    personId: input.personId,
    kind: 'points',
    title: `Баллы: ${gift.points}`,
    points: gift.points,
    productId: null,
    officeId: null,
    code: null,
    status: 'credited',
    lifetimeDays: null,
    ...originFields(input.origin),
  });

  // Без кода вставке не с чем конфликтовать: пустой ответ здесь — поломка.
  if (!reward) {
    throw new Error(`награда-баллы человеку ${input.personId} не вставилась`);
  }

  return reward;
};

const grantProduct = async (
  transaction: Transaction,
  input: GrantRewardInput,
  gift: Extract<RewardGift, { kind: 'product' }>,
): Promise<RewardRow> => {
  await requireOpenOffice(transaction, gift.officeId);

  const product = await findProduct(gift.productId, transaction);

  // Черновик и архивный наградой не выдаются, как и не заказываются. Признак «для акции»
  // не обязателен: вручить можно и товар каталога.
  if (!product || product.publishedAt === null || product.archivedAt !== null || !product.name) {
    throw new RewardProductUnavailableError(gift.productId);
  }

  const [stock] = await lockStockRows(transaction, gift.officeId, [gift.productId]);

  if (!stock || stock.onHand < 1) {
    throw new RewardStockShortError(gift.officeId, gift.productId);
  }

  const reward = await insertAwaitingReward(transaction, {
    personId: input.personId,
    kind: 'product',
    // Копия названия: товар переименуют, а награда обязана помнить, что обещали.
    title: product.name,
    points: null,
    productId: product.id,
    officeId: gift.officeId,
    lifetimeDays: gift.lifetimeDays,
    ...originFields(input.origin),
  });

  await writeStockMovement(transaction, {
    officeId: gift.officeId,
    productId: product.id,
    kind: 'reward_reserve',
    deltaOnHand: -1,
    deltaReserved: 1,
    rewardId: reward.id,
    employeeId: input.origin.source === 'manual' ? input.origin.employeeId : null,
  });

  return reward;
};

const grantCustom = async (
  transaction: Transaction,
  input: GrantRewardInput,
  gift: Extract<RewardGift, { kind: 'custom' }>,
): Promise<RewardRow> => {
  await requireOpenOffice(transaction, gift.officeId);

  return insertAwaitingReward(transaction, {
    personId: input.personId,
    kind: 'custom',
    title: gift.title,
    points: null,
    productId: null,
    officeId: gift.officeId,
    lifetimeDays: gift.lifetimeDays,
    ...originFields(input.origin),
  });
};

export const grantReward = async (input: GrantRewardInput): Promise<RewardRow> => {
  const reward = await db.$transaction(async (transaction) => {
    const driverAccount = await findDriverAccountByPerson(input.personId, transaction);

    if (!driverAccount) {
      throw new DriverAccountMissingError(input.personId);
    }

    const { gift } = input;

    if (gift.kind === 'points') {
      return grantPoints(transaction, input, gift, driverAccount.id);
    }

    if (gift.kind === 'product') {
      return grantProduct(transaction, input, gift);
    }

    return grantCustom(transaction, input, gift);
  });

  log.info('награда выдана', {
    rewardId: reward.id,
    personId: input.personId,
    kind: reward.kind,
    source: reward.source,
    officeId: reward.officeId,
  });

  return reward;
};
