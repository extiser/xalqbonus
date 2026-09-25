/**
 * Контракт наград (issue #172): стойка, раздел водителя и ручная выдача в админке.
 *
 * Типы лежат в `shared/`, потому что у них два потребителя — обработчик и разметка.
 * Времена — строками ISO-8601, незаполненное поле — `null`.
 */

import type {
  GiftClaimMode,
  RewardKind,
  RewardSource,
  RewardStatus,
} from '../../server/generated/prisma/enums';
import type { MemberOffice } from './miniapp';
import type { OfficeOrder } from './orders';

export type { GiftClaimMode, RewardKind, RewardSource, RewardStatus };

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
 * Награда в разделе «Мои награды» и на её экране — готовыми строками на языке водителя, как
 * весь экран участника. Экран награды строится из этого же ответа: своей ручки у одной награды нет.
 */
export type MemberReward = {
  rewardId: string;
  kind: RewardKind;
  /** Ждущий подарок сюда не входит: у него своя карточка — `MemberGift`. */
  status: Exclude<RewardStatus, 'claimable'>;
  /** Что за награда: «300 баллов», название товара или произвольной. */
  title: string;
  /** Откуда: «Акция „…“ · сундук дня» или «Вручил парк · пояснение». */
  originText: string;
  /** Слово состояния: «Ждёт в офисе», «На балансе», «Получена», «Срок вышел». */
  stateWord: string;
  /**
   * Уточнение после точки в списке: у ждущей — «до 5 октября», у баллов — дата зачисления,
   * у полученной — «20.09.2026, 16:10», у сгоревшей — дата сгорания.
   */
  stateHint: string;
  /** Срок на экране награды — только у ждущей: «заберите до 5 октября». */
  claimHint: string | null;
  /**
   * Строка состояния целиком — для карточки на главной: у ждущей «Ждёт в офисе до 5 октября»,
   * у остальных «{stateWord} · {stateHint}». Собрана на сервере: на узбекском порядок слов другой.
   */
  stateText: string;
  /** Причина — только у сгоревшей: коротко для списка и целиком для экрана награды. */
  reasonText: string | null;
  reasonTextFull: string | null;
  /** Код — только у ждущей. Показывается крупно: водитель показывает экран, а не диктует. */
  code: string | null;
  /** Офис — у всех, кроме баллов: где получать или где получена. Архивный тоже. */
  office: MemberOffice | null;
  /** Фото товара — у награды-товара. Адрес собирает клиент правилом `ProductPhoto`. */
  photoPath: string | null;
  photoUpdatedAt: string | null;
  /** Цена товара в каталоге — у награды-товара, зачёркнутой рядом с «0». Пусто у приза без цены. */
  pricePoints: number | null;
};

/**
 * Подарок от Xalq Taxi, ждущий водителя (issue #219), — готовыми строками на его языке.
 * Свой вид, а не `MemberReward`: у подарка нет ни офиса, ни кода, ни слова состояния — только
 * сумма, повод и срок, после которого баллы придут сами.
 */
export type MemberGift = {
  rewardId: string;
  /** «300 баллов в подарок». */
  title: string;
  /** «Xalq Taxi · ко Дню учителя». */
  reasonText: string;
  /** «Заберите до 5 октября». */
  deadlineText: string;
};

export type MiniAppRewardsResponse = {
  /** Награды со своим видом. Ждущие подарки сюда не входят — они в `gifts`. */
  rewards: MemberReward[];
  /** Ждущие подарки, свежие первыми. */
  gifts: MemberGift[];
  /** Есть подарок, которого водитель ещё не видел в шторке: шторка показывается сама. */
  giftsUnseen: boolean;
};

/** «Забрать» (`POST /api/miniapp/gifts/{rewardId}/claim`): баланс после зачисления. */
export type MiniAppGiftClaimResponse = {
  balancePoints: number;
};

/** Тело отметки «шторку видел» (`POST /api/miniapp/gifts/shown`). */
export type MiniAppGiftsShownBody = {
  rewardIds: string[];
};

/**
 * Отказ «Забрать»: `gift_not_found` — подарка нет или он чужой (`404`), `gift_not_claimable` —
 * уже зачислен (`409`). Экран решает по коду, текст — водителю на его языке.
 */
export type MemberGiftDenialCode = 'gift_not_found' | 'gift_not_claimable';

export type MemberGiftDenialPayload = { code: MemberGiftDenialCode };

/**
 * Тексты раздела и экрана награды на языке участника. Приезжают с экраном участника, как тексты
 * заказов; общие с другими разделами — заголовок, пустота, «Назад», «Сумма» — берутся из его текстов.
 */
export type MemberRewardTexts = {
  awaitingGroup: string;
  pastGroup: string;
  /** «Награда» — заголовок экрана награды и подпись строки награды на нём. */
  screenTitle: string;
  codeTitle: string;
};

// ---------------------------------------------------------------------------
// Карточка водителя
// ---------------------------------------------------------------------------

/**
 * Награда в карточке водителя (issue #175) — только просмотр. Сотрудник отвечает по ней
 * водителю, позвонившему с вопросом «что мне положено и где мой приз».
 */
export type DriverReward = {
  rewardId: string;
  kind: RewardKind;
  status: RewardStatus;
  /** Название товара на момент рождения или произвольной награды; у баллов — их тоже. */
  title: string;
  /** Сумма — только у баллов. */
  points: number | null;
  /** Код — только у ждущей: у выданной и сгоревшей он освобождён и может быть чужим. */
  code: string | null;
  /** Офис выдачи. Пуст у баллов. */
  officeName: string | null;
  /** Срок, до которого награда ждёт в офисе. Пуст у баллов. */
  expiresAt: string | null;
  issuedAt: string | null;
  /** Кто выдал у стойки. */
  issuedByName: string | null;
  expiredAt: string | null;
  /**
   * Подарок лёг на баланс (issue #219): когда и как — забрал сам (`driver`) или зачислилось
   * по сроку (`auto`). Пусто у всех, кроме зачисленного подарка. У ждущего подарка `expiresAt` —
   * момент, когда он зачислится сам.
   */
  claimedAt: string | null;
  claimMode: GiftClaimMode | null;
  source: RewardSource;
  /** Акция — у источника `campaign`. */
  campaignTitle: string | null;
  /** Пояснение внутри источника: у ручной — пояснение автора, у акции — «сундук дня». */
  sourceNote: string | null;
  /** Кто вручил — у ручной и подарка всегда: вручение без следа в программе не бывает. */
  grantedByName: string | null;
  createdAt: string;
};

export type DriverRewardsResponse = {
  /** Ждущие в офисе первыми, дальше свежие первыми. */
  rewards: DriverReward[];
};

// ---------------------------------------------------------------------------
// Ручная выдача
// ---------------------------------------------------------------------------

/**
 * Тело ручной выдачи — то, что набрано в форме, строками. Какие поля нужны, зависит от вида:
 * у товара — товар, офис и срок, у произвольной — название, офис и срок. Пояснение обязательно
 * всегда. Баллы ручной выдачей не вручаются — они подарок (`GiftGrantRequestBody`, issue #219).
 */
export type ManualRewardRequestBody = {
  kind: string;
  productId: string;
  title: string;
  officeId: string;
  lifetimeDays: string;
  note: string;
};

/** Поле формы, к которому относится отказ, — текст встаёт рядом с ним. */
export type ManualRewardField =
  | 'kind'
  | 'productId'
  | 'title'
  | 'officeId'
  | 'lifetimeDays'
  | 'note';

export type ManualRewardResponse = {
  rewardId: string;
  kind: RewardKind;
  /** Код для стойки. */
  code: string | null;
};

/** Что можно выбрать в форме ручной выдачи. */
export type RewardGrantOptionsResponse = {
  /** Рабочие офисы. */
  offices: { officeId: string; name: string }[];
  /** Опубликованные товары не в архиве; призы помечены. */
  products: { productId: string; name: string; promo: boolean }[];
};

// ---------------------------------------------------------------------------
// Подарки от Xalq Taxi
// ---------------------------------------------------------------------------

/**
 * Тело раздачи подарка (`POST /api/gifts`, issue #219) — то, что набрано в форме, строками.
 * Получатель — водитель или сегмент, заполнено поле своего вида.
 */
export type GiftGrantRequestBody = {
  recipientKind: string;
  personId: string;
  segmentId: string;
  points: string;
  reason: string;
  /** «Забрать до», `YYYY-MM-DD`. */
  untilDate: string;
};

/** Поле формы раздачи, к которому относится отказ. */
export type GiftGrantField = 'recipient' | 'points' | 'reason' | 'untilDate';

/** Раздача в списке раздела «Награды»: кому, что, кто выдал и что стало с подарками. */
export type GiftGrant = {
  giftGrantId: string;
  createdAt: string;
  recipientKind: 'person' | 'segment';
  personId: string | null;
  /** «Фамилия Имя» из профиля. `null` — профиль без имени или раздача сегменту. */
  driverName: string | null;
  segmentId: string | null;
  segmentName: string | null;
  points: number;
  reason: string;
  /** День автозачисления, `YYYY-MM-DD`. */
  untilDate: string;
  grantedByName: string;
  /** Сколько подарков родилось. */
  recipients: number;
  /** Сколько человек из сегмента пропущено: не участники программы. */
  skipped: number;
  /** Забрали сами. */
  claimedByDriver: number;
  /** Зачислено по сроку. */
  creditedAuto: number;
  /** Ещё ждут. */
  waiting: number;
};

export type GiftGrantsResponse = {
  /** Свежие первыми. */
  grants: GiftGrant[];
};

export type GiftGrantResponse = {
  grant: GiftGrant;
};
