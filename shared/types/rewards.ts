/**
 * Контракт наград (issue #172): стойка, раздел водителя и ручная выдача в админке.
 *
 * Типы лежат в `shared/`, потому что у них два потребителя — обработчик и разметка.
 * Времена — строками ISO-8601, незаполненное поле — `null`.
 */

import type {
  RewardKind,
  RewardSource,
  RewardStatus,
} from '../../server/generated/prisma/enums';
import type { OfficeOrder } from './orders';

export type { RewardKind, RewardSource, RewardStatus };

// ---------------------------------------------------------------------------
// Стойка
// ---------------------------------------------------------------------------

/**
 * Награда, какой её видит сотрудник у стойки: кому, что и почему. Только награды с офисом —
 * товар и произвольная: у баллов кода нет, и на стойку они не приходят.
 */
export type OfficeReward = {
  rewardId: string;
  kind: RewardKind;
  /** Что выдаётся: название товара на момент рождения или произвольной награды. */
  title: string;
  status: RewardStatus;
  /** Код — только у ждущей: у выданной и сгоревшей он освобождён и может быть чужим. */
  code: string | null;
  officeId: string;
  officeName: string;
  /** «Фамилия Имя» из профиля. `null` — профиль без имени. */
  driverName: string | null;
  callsign: string | null;
  /** Открытый номер профиля. `null` — телефона нет. */
  phone: string | null;
  /** Почему выдаётся: «Награда — вручную, пояснение» или «Награда — акция „…“, сундук дня». */
  reasonText: string;
  createdAt: string;
  expiresAt: string;
  issuedAt: string | null;
  expiredAt: string | null;
};

/**
 * Что нашлось по коду у стойки. Поле кода одно на заказы и награды, и ответ размечен: экран
 * решает по `kind`, какую карточку показать (`GET /api/desk/by-code`).
 */
export type DeskItemResponse =
  | { kind: 'order'; order: OfficeOrder }
  | { kind: 'reward'; reward: OfficeReward };

export type OfficeRewardResponse = {
  reward: OfficeReward;
};

// ---------------------------------------------------------------------------
// Раздел водителя
// ---------------------------------------------------------------------------

/**
 * Награда в разделе «Мои награды» — готовыми строками на языке водителя, как весь экран
 * участника.
 */
export type MemberReward = {
  rewardId: string;
  kind: RewardKind;
  status: RewardStatus;
  /** Что за награда: «300 баллов», название товара или произвольной. */
  title: string;
  /** Откуда: «Акция „…“ · сундук дня» или «Вручил парк · пояснение». */
  originText: string;
  /** Состояние словами: «На балансе», «Ждёт в офисе до …», «Получена …», «Срок вышел …». */
  stateText: string;
  /** Код — только у ждущей. Показывается крупно: водитель показывает экран, а не диктует. */
  code: string | null;
  /** Офис — у всех, кроме баллов: где получать или где получена. */
  officeName: string | null;
  officeAddress: string | null;
};

export type MiniAppRewardsResponse = {
  rewards: MemberReward[];
};

/** Тексты раздела на языке участника. Приезжают с экраном участника, как тексты заказов. */
export type MemberRewardTexts = {
  myRewards: string;
  rewardsTitle: string;
  rewardsEmpty: string;
  rewardsFailed: string;
  codeTitle: string;
};

// ---------------------------------------------------------------------------
// Ручная выдача
// ---------------------------------------------------------------------------

/**
 * Тело ручной выдачи — то, что набрано в форме, строками. Какие поля нужны, зависит от вида:
 * у баллов — сумма, у товара — товар, офис и срок, у произвольной — название, офис и срок.
 * Пояснение обязательно всегда.
 */
export type ManualRewardRequestBody = {
  kind: string;
  points: string;
  productId: string;
  title: string;
  officeId: string;
  lifetimeDays: string;
  note: string;
};

/** Поле формы, к которому относится отказ, — текст встаёт рядом с ним. */
export type ManualRewardField =
  | 'kind'
  | 'points'
  | 'productId'
  | 'title'
  | 'officeId'
  | 'lifetimeDays'
  | 'note';

export type ManualRewardResponse = {
  rewardId: string;
  kind: RewardKind;
  /** Код для стойки. Пусто у баллов. */
  code: string | null;
};

/** Что можно выбрать в форме ручной выдачи. */
export type RewardGrantOptionsResponse = {
  /** Рабочие офисы. */
  offices: { officeId: string; name: string }[];
  /** Опубликованные товары не в архиве; призы помечены. */
  products: { productId: string; name: string; promo: boolean }[];
};
