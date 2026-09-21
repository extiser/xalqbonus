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

import type { OrderCancelReason, OrderStatus } from '../../server/generated/prisma/enums';

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

export type OfficeOrderLine = {
  productId: string;
  name: string;
  quantity: number;
  /** Цена на момент заказа, а не текущая цена каталога. */
  unitPoints: number;
};

/**
 * Заказ, каким его видит сотрудник у стойки: кого, что, сколько и до какого срока.
 *
 * Водитель назван именем из рабочего профиля парка и позывным — по ним его узнают в офисе.
 * Баланса водителя здесь нет: выдача его не трогает, а отмена возвращает ровно сумму заказа.
 */
export type OfficeOrder = {
  orderId: string;
  number: number;
  status: OrderStatus;
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
  totalPoints: number;
  createdAt: string;
  expiresAt: string;
  issuedAt: string | null;
  cancelledAt: string | null;
  cancelReason: OrderCancelReason | null;
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
