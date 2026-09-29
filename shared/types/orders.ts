/**
 * Контракт заказов офиса: что отдают ручки `server/api/orders/` сотруднику — одинаково в веб
 * и в Mini App.
 *
 * Ручки одни на обе двери (docs/decisions.md → «Доступ определяется ролью, а не дверью»),
 * поэтому и контракт один: экран в телефоне и таблица за столом читают одно и то же.
 *
 * Времена — строками ISO-8601: через JSON `Date` всё равно приезжает строкой. Показывает их
 * клиент в зоне парка (`app/utils/format.ts`).
 */

import type {
  OrderCancelReason,
  OrderChannel,
  OrderPayment,
  OrderStatus,
} from '../../server/generated/prisma/enums';

/**
 * Офис, в котором сотрудник может выдавать заказы.
 *
 * Архивный здесь тоже бывает: заказ, оформленный до закрытия офиса, всё ещё висит и его
 * надо выдать или отменить. Признак стоит, чтобы экран его пометил.
 */
export type EmployeeOffice = {
  officeId: string;
  name: string;
  address: string;
  archived: boolean;
};

/**
 * Офис на выборе офиса у стойки Mini App (`GET /api/desk/offices`, issue #250): архивных нет,
 * у каждого — сколько ждут выдачи, заказы и награды вместе.
 */
export type DeskOffice = EmployeeOffice & { awaitingCount: number };

export type DeskOfficesResponse = { offices: DeskOffice[] };

export type OfficeOrderLine = {
  productId: string;
  name: string;
  quantity: number;
  /**
   * Цена на момент заказа, а не текущая цена каталога, — в валюте способа оплаты заказа:
   * в баллах у `points`, в сумах у `retail`. Вторая пуста.
   */
  unitPoints: number | null;
  unitRetail: number | null;
  /**
   * Фото товара — текущее, из каталога: у позиции своего нет. Адрес собирает клиент правилом
   * `ProductPhoto`, отметка правки — его версия. Читает карточка стойки в Mini App (issue #250).
   */
  photoPath: string | null;
  photoUpdatedAt: string;
};

/**
 * Заказ, каким его видит сотрудник у стойки: кого, что, сколько и до какого срока.
 *
 * Водитель назван именем из рабочего профиля парка и позывным — по ним его узнают в офисе.
 * Баланса водителя здесь нет: выдача его не трогает, а отмена возвращает ровно сумму заказа.
 *
 * Сумма — одна из двух, по способу оплаты: в баллах у `points`, в сумах у `retail`
 * (issue #294). Розничный заказ виден только здесь, в админке: водителю он не показывается.
 */
export type OfficeOrder = {
  orderId: string;
  number: number;
  status: OrderStatus;
  payment: OrderPayment;
  /** Откуда заказ: водитель в боте или сотрудник у стойки. */
  channel: OrderChannel;
  /** Код — только у висящего: у выданного и отменённого он освобождён и может быть чужим. */
  code: string | null;
  officeId: string;
  officeName: string;
  /** «Фамилия Имя» из профиля. `null` — профиль без имени: реестр приходит из чужой системы. */
  driverName: string | null;
  callsign: string | null;
  /** Открытый номер профиля. `null` — телефона нет: у десятой части профилей его нет вовсе. */
  phone: string | null;
  lines: OfficeOrderLine[];
  /** Только у `points`. */
  totalPoints: number | null;
  /** Только у `retail`, в сумах. */
  totalRetail: number | null;
  createdAt: string;
  /** Только у заказа бота: заказ стойки не висит. */
  expiresAt: string | null;
  issuedAt: string | null;
  cancelledAt: string | null;
  cancelReason: OrderCancelReason | null;
};

/**
 * Товар офиса для оформления у стойки (issue #294): свободный остаток и обе цены. Экран
 * предлагает товар в том способе оплаты, у которого есть цена, — за баллы при `pricePoints`,
 * за розницу при `priceRetail`.
 */
export type DeskProduct = {
  productId: string;
  name: string;
  /** Пусто — за баллы не продаётся: приз без цены в баллах. */
  pricePoints: number | null;
  /** Пусто — за розницу не продаётся: розничной цены нет. */
  priceRetail: number | null;
  available: number;
};

export type DeskProductsResponse = {
  products: DeskProduct[];
};

/** Способы оплаты заказа стойки. */
export const ORDER_PAYMENTS: readonly OrderPayment[] = ['points', 'retail'];

/**
 * Оформление заказа у стойки (`POST /api/orders`, issue #294): офис, водитель, способ оплаты
 * и позиции. Цены сюда не входят — их берёт сервер из каталога на момент оформления.
 */
export type DeskOrderRequestBody = {
  officeId: string;
  personId: string;
  payment: OrderPayment;
  items: { productId: string; quantity: number }[];
};

/** Статусы, по которым фильтруется список. Нет фильтра — все заказы офиса. */
export const OFFICE_ORDER_STATUSES: readonly OrderStatus[] = ['pending', 'issued', 'cancelled'];

/**
 * Страница заказов одного офиса, висящие первыми.
 *
 * Офисы сотрудника приезжают вместе со списком: из них экран строит выбор офиса, а своей
 * ручки «мои офисы» у веба нет — она ответила бы ровно тем же.
 */
export type OfficeOrdersResponse = {
  offices: EmployeeOffice[];
  /** Офис, чьи заказы в ответе: запрошенный или, если не запрашивали, первый работающий. */
  officeId: string;
  orders: OfficeOrder[];
  total: number;
  limit: number;
  offset: number;
};

export type OfficeOrderResponse = {
  order: OfficeOrder;
};
