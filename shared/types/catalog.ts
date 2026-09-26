/**
 * Контракт ручек каталога: офисы, товары, остатки и журнал движений.
 *
 * Типы лежат в `shared/`, потому что у них два потребителя — обработчик и разметка,
 * и второе описание тех же полей разошлось бы с первым на ближайшей правке.
 *
 * Времена уезжают строками ISO-8601, а не `Date`: через JSON `Date` всё равно проходит
 * строкой, и тип, обещающий `Date` там, где приедет строка, врёт разметке.
 *
 * Незаполненное поле — `null`, а не пустая строка. Пустая строка в ответе означала бы,
 * что телефон офиса записан пустым, а не что его не записывали.
 */

import type { EmployeeRole, StockMovementKind } from '../../server/generated/prisma/enums';

// ---------------------------------------------------------------------------
// Офисы
// ---------------------------------------------------------------------------

/** Офис целиком: полей мало, и укороченного вида для списка ему не нужно. */
export type Office = {
  officeId: string;
  name: string;
  address: string;
  /** Ссылка на карту. Адресом в старой базе была именно она, и подменять адрес ею нельзя. */
  mapUrl: string | null;
  workHours: string | null;
  phoneE164: string | null;
  /** Имя или ссылка на Telegram офиса — как записал парк. */
  telegram: string | null;
  /** Заполнено — офис в архиве: заказов не принимает, из истории не исчезает. */
  archivedAt: string | null;
  /** ДЕМО ОФИС (issue #205, #212): живому водителю не виден, править может только владелец. */
  isDemo: boolean;
};

export type OfficeListResponse = {
  offices: Office[];
};

/**
 * Тело заведения и правки офиса. Необязательные поля приходят строками и пустыми:
 * форма отдаёт то, что в ней набрано, а «пусто значит не задано» решает сервис —
 * одинаково для заведения и для правки.
 */
export type OfficeRequestBody = {
  name: string;
  address: string;
  mapUrl?: string;
  workHours?: string;
  phoneE164?: string;
  telegram?: string;
};

/**
 * Тело заведения: то же, что у правки, и признак демо (issue #212). Ставит его только владелец,
 * и только здесь — правка его не принимает: живое в демо не превращается и обратно.
 */
export type OfficeCreateRequestBody = OfficeRequestBody & { isDemo: boolean };

export type OfficeResponse = {
  office: Office;
};

/** Сотрудник, закреплённый за офисом. Телефона здесь нет: для привязки он не нужен. */
export type OfficeEmployee = {
  employeeId: string;
  fullName: string;
  role: EmployeeRole;
};

export type OfficeCardResponse = {
  office: Office;
  employees: OfficeEmployee[];
};

/**
 * Привязка сотрудников к офису — набором целиком, а не по одному.
 *
 * `PUT`, потому что это и есть замена набора: добавление и снятие в одном экране правят
 * один список, и два действия («привязать», «снять») означали бы две ручки, из которых
 * вторую однажды забудут позвать.
 */
export type OfficeEmployeesRequestBody = {
  employeeIds: string[];
};

export type OfficeEmployeesResponse = {
  employees: OfficeEmployee[];
};

// ---------------------------------------------------------------------------
// Товары
// ---------------------------------------------------------------------------

export type Product = {
  productId: string;
  /** Пусто только у черновика: он заводится первым набранным символом (issue #148). */
  name: string | null;
  description: string | null;
  /**
   * Относительный путь файла на томе — `products/<uuid>.<расширение>`. Адрес картинки
   * разметка собирает сама: `/uploads/` плюс этот путь плюс `?v=<updatedAt>`.
   */
  photoPath: string | null;
  /** Пусто только у черновика — как и обе цены в сумах. */
  pricePoints: number | null;
  /** Розничная цена в сумах. */
  priceRetail: number | null;
  /** Себестоимость в сумах. */
  priceCost: number | null;
  /** Пусто — черновик: водителю не виден нигде, удаляется, а не архивируется. */
  publishedAt: string | null;
  archivedAt: string | null;
  /** Приз для акции: публикуется без цены в баллах (issue #172). */
  promo: boolean;
  /** Не показывать на витрине водителя. Снимается — товар выходит на витрину как есть. */
  hiddenInCatalog: boolean;
  /**
   * Демо-товар (issue #212): его видит и заказывает только демо-водитель. Ставится при
   * заведении и не меняется; править его может только владелец.
   */
  isDemo: boolean;
  /**
   * Время последней правки. Нужно разметке: имя файла фото меняется вместе с расширением,
   * а не с содержимым, и без этой отметки перезалитая картинка осталась бы в кэше браузера.
   */
  updatedAt: string;
};

export type ProductListResponse = {
  products: Product[];
};

/**
 * Тело заведения и правки товара — то, что набрано в форме, строками. Пустое поле — пустая
 * строка: обязательных у черновика нет, и «пусто значит не задано» решает сервер.
 */
export type ProductRequestBody = {
  name: string;
  description: string;
  pricePoints: string;
  priceRetail: string;
  priceCost: string;
  promo: boolean;
  hiddenInCatalog: boolean;
};

/**
 * Тело заведения: то же, что у правки, и признак демо (issue #212). Ставит его только владелец,
 * и только здесь — правка его не принимает: живое в демо не превращается и обратно.
 */
export type ProductCreateRequestBody = ProductRequestBody & { isDemo: boolean };

export type ProductResponse = {
  product: Product;
};

// ---------------------------------------------------------------------------
// Остатки
// ---------------------------------------------------------------------------

/**
 * Строка таблицы остатков офиса: товар и два его числа.
 *
 * Товар без движений в этом офисе тоже здесь, с нулями: приход в офис, где товара ещё
 * не было, — штатный случай, и выбирать товар для прихода надо из каталога, а не из того,
 * что уже лежит.
 */
export type OfficeStockRow = {
  productId: string;
  name: string;
  /** Пусто у приза: он не продаётся (issue #172). */
  pricePoints: number | null;
  /** Приз для акции. */
  promo: boolean;
  /** Не показывается на витрине, но приходуется и лежит как любой другой. */
  hiddenInCatalog: boolean;
  archivedAt: string | null;
  /** Свободный остаток: лежит в офисе и никем не занят. */
  onHand: number;
  /**
   * Занято висящими заказами и ждущими наградами. Правка его не трогает: он принадлежит
   * оплаченным заказам и обещанным призам.
   */
  reserved: number;
};

export type OfficeStockResponse = {
  officeId: string;
  rows: OfficeStockRow[];
};

/** Приход: сколько пришло и зачем. Заметка необязательна — накладная говорит сама. */
export type StockReceiveRequestBody = {
  quantity: number;
  note?: string;
};

/**
 * Правка: **новое значение**, а не дельта.
 *
 * Считает дельту сервер, под той же блокировкой, в которой пишет движение: посчитанная
 * в браузере дельта опирается на остаток, показанный секунду назад, и заказ, оформленный
 * в этот промежуток, она бы затёрла.
 *
 * Заметка обязательна: правка без объяснения через месяц неотличима от ошибки кода.
 */
export type StockAdjustRequestBody = {
  onHand: number;
  note: string;
};

/** Остаток пары после операции — тем же ответом, чтобы страница не спрашивала повторно. */
export type StockOperationResponse = {
  productId: string;
  onHand: number;
  reserved: number;
};

/** Строка журнала движений офиса. */
export type StockMovementEntry = {
  /**
   * Идентификатор строки журнала. Строкой: в базе это bigint, а JSON целых такой ширины
   * не знает.
   */
  movementId: string;
  kind: StockMovementKind;
  productId: string;
  productName: string;
  deltaOnHand: number;
  deltaReserved: number;
  /** Номер заказа, которым вызвано движение. Пуст у прихода и правки. */
  orderNumber: number | null;
  /** Награда, которой вызвано движение, — её название. Пусто у всех, кроме трёх видов награды. */
  rewardTitle: string | null;
  /** Кто сделал. Пуст у движения, сделанного водителем из Mini App или воркером просрочки. */
  employeeName: string | null;
  note: string | null;
  createdAt: string;
};

/** Что случилось с произвольной наградой: вручена, выдана у стойки, сгорела. */
export type OfficeRewardEvent = 'granted' | 'issued' | 'expired';

/**
 * Событие произвольной награды в ленте офиса (issue #175). Движения у неё нет — на складе
 * ничего не лежало, — и без этой строки выданную награду офис не видел бы нигде. Несёт то же,
 * что строка движения: что за награда, что произошло, когда и кто это сделал.
 */
export type OfficeRewardEventEntry = {
  rewardId: string;
  event: OfficeRewardEvent;
  rewardTitle: string;
  /** Акция — у вручения наградой акции: вручила она, а не сотрудник. */
  campaignTitle: string | null;
  /** Кто сделал. Пуст у сгорания — его делает воркер — и у вручения акцией. */
  employeeName: string | null;
  /** Пояснение к вручению. У выдачи и сгорания пусто. */
  note: string | null;
  createdAt: string;
};

/**
 * Строка ленты офиса: движение остатка или событие награды без движения. Размечена `type`:
 * экран решает по нему, какую строку рисовать.
 */
export type OfficeFeedEntry =
  | { type: 'movement'; movement: StockMovementEntry }
  | { type: 'reward'; reward: OfficeRewardEventEntry };

/**
 * Лента офиса страницей, новыми вперёд: движения остатков и события произвольных наград
 * вперемешку по времени. Журнал движений при этом не расширяется — строки без товара
 * сломали бы сверку остатка с ним.
 */
export type OfficeFeedResponse = {
  entries: OfficeFeedEntry[];
  total: number;
  limit: number;
  offset: number;
};
