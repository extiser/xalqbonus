import type { RewardStatus } from '#server/generated/prisma/enums';

/**
 * Доменные ошибки наград (issue #172).
 *
 * Устроены как ошибки заказа (`services/orders/errors.ts`): несут не строку для человека,
 * а то, чего именно не хватило, — текст к отказу берёт ручка из словаря. Повтор выдачи
 * ошибкой сам по себе не является: вторая операция не делается, первая уже сделана.
 */
export abstract class RewardsError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Офиса нет или он в архиве: наград он не выдаёт. */
export class RewardOfficeUnavailableError extends RewardsError {
  constructor(public readonly officeId: string) {
    super(`офис ${officeId} не выдаёт наград`);
  }
}

/** Товара нет, он черновик или в архиве: наградой его не выдать. */
export class RewardProductUnavailableError extends RewardsError {
  constructor(public readonly productId: string) {
    super(`товар ${productId} нельзя выдать наградой`);
  }
}

/**
 * Свободного остатка не хватило: награда-товар не заводится. Товар обещать водителю нельзя,
 * если на полке его нет, — иначе он уедет другому или не найдётся вовсе. Что делать с этим
 * отказом, решает вызывающий: ручная выдача показывает его сотруднику.
 */
export class RewardStockShortError extends RewardsError {
  constructor(
    public readonly officeId: string,
    public readonly productId: string,
  ) {
    super(`в офисе ${officeId} нет свободного товара ${productId}`);
  }
}

/**
 * Перевод баллов по этому ключу уже был: повтор вызова не заводит вторую награду рядом
 * с единственным начислением. Для ручной выдачи недостижимо — ключ выдаётся на запрос.
 */
export class RewardPointsAlreadyCreditedError extends RewardsError {
  constructor(public readonly idempotencyKey: string) {
    super(`баллы по ключу ${idempotencyKey} уже зачислены`);
  }
}

/** Свободный код за отведённые попытки не нашёлся. Нужна, чтобы невозможное не стало циклом. */
export class RewardCodeCollisionError extends RewardsError {
  constructor(public readonly attempts: number) {
    super(`свободный код награды не нашёлся за ${attempts} попыток`);
  }
}

/** Что не так с вводом ручной выдачи. Текст к каждой причине — у ручки. */
export type ManualRewardProblem =
  /** Сумма баллов — не целое положительное число. */
  | 'points_invalid'
  /** Вид «товар» без товара. */
  | 'product_missing'
  /** Вид «произвольная» без названия. */
  | 'title_missing'
  /** Товар или произвольная без офиса. */
  | 'office_missing'
  /** Срок — не целое положительное число дней. */
  | 'lifetime_invalid'
  /** Пояснения нет. */
  | 'note_missing'
  /** Вид награды не из трёх. */
  | 'kind_invalid';

export class InvalidManualRewardError extends RewardsError {
  constructor(public readonly problem: ManualRewardProblem) {
    super(`ручная награда не годится: ${problem}`);
  }
}

/** Награды с таким идентификатором нет вовсе — или это баллы, которым у стойки делать нечего. */
export class UnknownRewardError extends RewardsError {
  constructor(public readonly rewardId: string) {
    super(`награды ${rewardId} нет`);
  }
}

/**
 * Ждущей награды нет: по идентификатору она уже не ждёт — выдана или сгорела между чтением
 * и блокировкой. Исход двойного нажатия и гонки двух сотрудников.
 */
export class RewardNotAwaitingError extends RewardsError {
  constructor(
    public readonly rewardId: string,
    public readonly status: RewardStatus | null,
  ) {
    super(`награда ${rewardId} уже не ждёт выдачи: ${status ?? 'неизвестно'}`);
  }
}
