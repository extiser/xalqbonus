/**
 * Контракт экрана водителя: то, что ручки `server/api/drivers/` отдают, а страницы поиска
 * и карточки принимают.
 *
 * Типы лежат в `shared/`, а не в `server/types/`, по той же причине, что и типы экрана
 * синхронизации: у них два потребителя — обработчик и разметка, и второе описание тех же
 * полей разошлось бы с первым на ближайшей правке.
 *
 * Числовые поля баллов приходят числами, а не `bigint`: в базе они `bigint`, но балл
 * начисляется по одному за поездку, и до предела точности `number` тут двенадцать
 * порядков. `bigint` не сериализуется в JSON вовсе, а строкой число, которое сравнивают
 * глазами, показывать незачем.
 */

// Словари берутся у Prisma, а не переписываются здесь строковым объединением: это наши
// перечисления, они меняются нашей же миграцией. Импорт только типов — в сборку
// не попадает ни байта.
import type {
  AccountType,
  Language,
  LinkCloseReason,
  LinkConfirmedBy,
  PointReason,
} from '../../server/generated/prisma/enums';

/** Номер водительского удостоверения — тот уровень личности, которому принадлежит баланс. */
export type DriverLicense = {
  /** Ровно как пришло из API. Его и диктует водитель. */
  numberRaw: string;
  /** Наша нормализация: по ней идёт поиск и по ней склеиваются двойники. */
  numberCanonical: string;
  country: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  observedAt: string;
  /** Пусто у действующего номера. Заполнено у прежнего — при перевыпуске. */
  closedAt: string | null;
  source: string;
};

/** Телефон профиля парка. Закрытые строки не удаляются: канал связи меняется часто. */
export type DriverPhone = {
  phoneRaw: string;
  /** Заполнен только у номеров вида `+998XXXXXXXXX`. По нему идёт автопривязка. */
  phoneE164: string | null;
  observedAt: string;
  closedAt: string | null;
};

/**
 * Учётка в парке. У человека их бывает несколько: увольнение и заведение заново дают
 * второй `profile_id` на том же номере ВУ, и склейка по номеру — то, из чего складывается
 * один баланс (docs/drivers.md).
 */
export type DriverParkProfile = {
  profileId: string;
  parkId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  /** Статус трудоустройства: `working`, `not_working`, `fired`. Словарь Fleet API. */
  workStatus: string;
  employmentType: string;
  workRuleName: string | null;
  hireDate: string | null;
  fireDate: string | null;
  /** Последний известный статус на линии: `free`, `busy`, `offline` и прочие. */
  currentStatus: string;
  currentStatusUpdatedAt: string | null;
  callsign: string | null;
  carNumber: string | null;
  carBrandModel: string | null;
  firstSeenAt: string;
  lastSyncedAt: string;
  phones: DriverPhone[];
  /** Поездок в базе по этому профилю. */
  tripsTotal: number;
  /** Время завершения последней поездки профиля. */
  lastTripEndedAt: string | null;
};

/**
 * Привязка Telegram. История не удаляется никогда: перепривязка — закрытие прежней строки
 * и новая рядом, и вопрос «кто и когда сидел на этом аккаунте» обязан иметь ответ.
 */
export type DriverTelegramLink = {
  /** Строкой: `chat_id` в базе `bigint`, а JSON таких чисел не знает. */
  telegramChatId: string;
  telegramUserId: string | null;
  linkedAt: string;
  closedAt: string | null;
  closeReason: LinkCloseReason | null;
  confirmedBy: LinkConfirmedBy;
  operatorRef: string | null;
};

/**
 * Участие в программе. Пусто у человека, который парку известен, а в программе
 * не состоит: граница проходит по строке настроек, а не по договорённости.
 */
export type DriverMembership = {
  joinedAt: string;
  /** Откуда пришло участие: `telegram`, `legacy_import`, `operator`. */
  joinedSource: string;
  language: Language;
  notificationsEnabled: boolean;
};

/**
 * Счёт водителя вместе со сверкой: кэш баланса против суммы журнала.
 *
 * Оба числа рядом намеренно. Баланс — производная от журнала, а поле `accounts.balance` —
 * кэш; расхождение означает, что кто-то пишет мимо сервиса журнала. Это главный инвариант
 * системы (`scripts/invariants.sql`, запрос 2), и человек, открывший карточку, обязан
 * увидеть, что он сошёлся, а не верить в это.
 */
export type DriverBalance = {
  accountId: string;
  /** Кэш из `xb.accounts`. */
  cachedBalance: number;
  /** Сумма `delta` по счёту из `xb.point_entries`. */
  journalBalance: number;
  /** Кэш минус журнал. Ноль — сходится. */
  difference: number;
  /** Записей журнала по счёту — оно же число операций в истории. */
  entriesCount: number;
  firstEntryAt: string | null;
  lastEntryAt: string | null;
};

/** Строка результата поиска по реестру парка. */
export type DriverSearchRow = {
  personId: string;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  /** Действующий номер ВУ, как пришёл из API. */
  licenseNumberRaw: string | null;
  licenseNumberCanonical: string | null;
  /** Действующие телефоны всех профилей человека. */
  phones: string[];
  /** Статусы трудоустройства по всем профилям человека. */
  workStatuses: string[];
  profilesCount: number;
  /** Состоит ли в программе. Реестр парка шире программы в шесть раз. */
  isMember: boolean;
  /** Кэш баланса. Пусто, когда счёта нет, — а не ноль: это разные вещи. */
  balance: number | null;
};

export type DriverSearchResponse = {
  /** Что искали — ровно то, что пришло. */
  query: string;
  /**
   * Во что превратился запрос при нормализации номера ВУ. Показывается на экране:
   * водитель диктует номер как попало, и видеть, по какому значению шёл поиск, —
   * половина ответа на «почему не нашёлся».
   */
  licenseCanonical: string | null;
  /** Цифры, по которым искали телефон. Пусто, если цифр в запросе слишком мало. */
  phoneDigits: string | null;
  /** Слова, по которым искали имя. */
  nameTerms: string[];
  rows: DriverSearchRow[];
  total: number;
  limit: number;
  offset: number;
};

export type DriverCardResponse = {
  personId: string;
  createdAt: string;
  /** Действующий номер ВУ. Пусто у человека без активной строки — такого быть не должно. */
  activeLicense: DriverLicense | null;
  /** Прежние номера: перевыпуск закрывает строку, а не правит её. */
  formerLicenses: DriverLicense[];
  profiles: DriverParkProfile[];
  /** Действующая привязка первой, закрытые — за ней. */
  telegramLinks: DriverTelegramLink[];
  /** Пусто у не участника. Пустой раздел карточки подписывается причиной, а не нулями. */
  membership: DriverMembership | null;
  /** Пусто, когда счёта нет. */
  balance: DriverBalance | null;
};

/** Вторая сторона перевода: перевод всегда двусторонний, и куда ушли баллы — видно. */
export type DriverOperationCounterparty = {
  accountId: string;
  type: AccountType;
  /** Человек по ту сторону — только у водительского счёта. */
  personId: string | null;
  name: string | null;
  /**
   * Запись журнала второй стороны. Пусто означает потерянную половину перевода —
   * первый инвариант из `docs/points.md`, и прятать это нельзя.
   */
  delta: number | null;
};

/** Заказ такси, за который начислен балл. */
export type DriverOperationTrip = {
  orderId: string;
  status: string;
  endedAt: string | null;
  /** Строкой: в базе `numeric`, и переводить деньги в `number` незачем. */
  price: string;
};

export type DriverOperation = {
  transferId: string;
  reason: PointReason;
  idempotencyKey: string;
  /**
   * Метка кампании из ключа `campaign:<slug>:<persons.id>`.
   *
   * Читается из ключа, а не из отдельной колонки: сущности «кампания» в базе нет, пока
   * `slug` в ключе отвечает на все вопросы (docs/points.md). Массовое начисление обязано
   * отличаться на экране от трёх тысяч независимых решений оператора.
   */
  campaignSlug: string | null;
  occurredAt: string;
  createdAt: string;
  /** Изменение баланса водителя, со знаком. */
  delta: number;
  /** Сумма перевода, всегда положительная. */
  amount: number;
  counterparty: DriverOperationCounterparty;
  /** Заказ такси из ключа операции. Заполнен у начислений за поездку. */
  tripOrderId: string | null;
  /**
   * Сама поездка. Пусто при заполненном `tripOrderId` означает, что заказа нет
   * в `xb.trips`, — это видно на экране, а не выглядит операцией без заказа.
   */
  trip: DriverOperationTrip | null;
  /** Заказ товара из старой базы — у перенесённых операций. */
  legacyOrderId: number | null;
  actor: string | null;
  note: string | null;
};

export type DriverHistoryResponse = {
  operations: DriverOperation[];
  total: number;
  limit: number;
  offset: number;
};
