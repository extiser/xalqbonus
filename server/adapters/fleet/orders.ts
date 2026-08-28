/**
 * Заказы парка из Fleet API: `POST /v1/parks/orders/list`.
 *
 * Выборка идёт **по всему парку сразу и по времени завершения** — `driver_profile`
 * в запросе не передаётся. На этих двух свойствах стоит вся схема синхронизации:
 * старый бот опрашивал API по каждому водителю отдельно и строил окно по времени
 * бронирования, отчего терял пятую часть поездок и тратил 4 062 запроса в час
 * (docs/analysis.md §1.1, docs/yandex-fleet.md).
 *
 * Пагинация курсорная, понятия глубины у неё нет: 26 860 заказов за неделю прошли
 * 55 страницами без единого повтора `id` (docs/decisions.md).
 *
 * Адаптер не знает про базу: наружу отдаётся разобранная структура, а кто и куда её
 * положит — дело сервиса (docs/principles.md → «Слои и зависимости»).
 */
import type { FleetTransport } from '#server/adapters/fleet/client';

const ORDERS_PATH = '/v1/parks/orders/list';

/** Предохранитель от бесконечной пагинации, как в разведочном скрипте. */
const MAX_PAGES = 2_000;

/**
 * Словари Fleet API. Чужие словари нам не принадлежат, поэтому поля хранятся текстом,
 * а перечисления в базу не заводятся (docs/decisions.md → «Перечисления заводим только
 * на свои словари»). Списки нужны ровно для одного: заметить, что на той стороне
 * появилось новое значение, — счётчиком в сводке прогона, а не отказом записи.
 *
 * Состав берётся из живых ответов, а не со страницы документации: в выгрузке за неделю
 * встретились категории `courier` и `intercity`, которых в документации нет вовсе
 * (docs/yandex-fleet.md → «Живой ответ не совпадает с документацией»).
 */
const KNOWN_STATUSES = new Set([
  'none',
  'driving',
  'waiting',
  'transporting',
  'complete',
  'cancelled',
  'calling',
  'expired',
  'failed',
]);

const KNOWN_CATEGORIES = new Set([
  'econom',
  'comfort',
  'comfort_plus',
  'business',
  'minivan',
  'vip',
  'wagon',
  'pool',
  'start',
  'standart',
  'ultimate',
  'maybach',
  'promo',
  'premium_van',
  'premium_suv',
  'suv',
  'personal_driver',
  'express',
  'cargo',
  // Встречены в живой выгрузке 27.08.2026, в документации отсутствуют.
  'courier',
  'intercity',
]);

const KNOWN_PAYMENT_METHODS = new Set([
  'cash',
  'cashless',
  'card',
  'internal',
  'other',
  'corp',
  'prepaid',
]);

/** Заказ в том виде, в каком его понимает ядро. Сырой ответ не хранится нигде. */
export type FleetOrder = {
  orderId: string;
  shortId: number | null;
  profileId: string;
  status: string;
  category: string;
  paymentMethod: string;
  provider: string;
  orderTypeId: string | null;
  orderTypeName: string | null;
  workRuleId: string | null;
  bookedAt: Date;
  apiCreatedAt: Date;
  drivingAt: Date | null;
  endedAt: Date | null;
  /** Число с фиксированной точкой строкой, как его отдаёт API: разбор в float теряет копейки. */
  price: string;
  mileage: string | null;
  carId: string;
  carCallsign: string | null;
  carLicenseNumber: string;
  carBrandModel: string;
  addressFromText: string;
  addressFromLat: number;
  addressFromLon: number;
  cancellationDescription: string | null;
  flags: string[];
  amenities: string[];
  events: FleetOrderEvent[];
  routePoints: FleetRoutePoint[];
};

export type FleetOrderEvent = {
  orderStatus: string;
  eventAt: Date;
};

export type FleetRoutePoint = {
  /** Порядковый номер точки в маршруте, с единицы: у заказа их до четырёх. */
  seq: number;
  address: string;
  lat: number;
  lon: number;
};

/**
 * Заказ, у которого не хватает поля, обязательного для записи, — время подачи, стоимость,
 * машина, адрес подачи. В выгрузке за неделю таких ноль из 26 860, но разбор об этом
 * не знает: пропущенный заказ считается отдельно и попадает в сводку прогона.
 */
export class OrderParseError extends Error {
  constructor(
    public readonly orderId: string,
    public readonly field: string,
  ) {
    super(`заказ ${orderId}: нет обязательного поля ${field}`);
    this.name = 'OrderParseError';
  }
}

/**
 * Заказ, не прошедший разбор, вместе с полем, которого ему не хватило.
 *
 * Именно пара, а не счётчик: прогон при этом успешен, отметка встаёт на верхнюю границу
 * окна, и заказ больше не будет запрошен — кроме окна догоняющего прогона. Знать, что
 * потеряно N заказов, и не знать какие — это тот же класс ошибки, против которого написана
 * вся задача, просто со счётчиком вместо тишины.
 */
export type MalformedOrder = {
  /** `(без id)`, если разбор споткнулся до идентификатора. */
  orderId: string;
  field: string;
};

/** Запись страницы, которая вообще не объект: даже поля, по которому спотыкаться, нет. */
const NOT_AN_OBJECT: MalformedOrder = { orderId: '(без id)', field: '(запись не объект)' };

/**
 * Что встретилось в ответе, кроме самих заказов.
 *
 * `unknownValues` — значения чужих словарей, которых мы раньше не видели. Они уже записаны
 * текстом и ничего не сломали; счётчик существует, чтобы мы узнали о расширении словаря
 * отчётом, а не отказом записи в разгар прогона.
 */
export type OrdersPage = {
  /** Сколько заказов пришло в ответе — до разбора. По нему судим о конце выборки. */
  received: number;
  orders: FleetOrder[];
  cursor: string | null;
  unknownValues: string[];
  /** Заказы, которые не удалось разобрать. Не записываются, считаются отдельно. */
  malformed: number;
  /** Кто именно не разобрался. Длина равна `malformed`: на странице список не режется. */
  malformedIds: MalformedOrder[];
};

export type OrdersWindow = {
  endedFrom: Date;
  endedTo: Date;
};

type RawOrder = Record<string, unknown>;

const readRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readText = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const readNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const readDate = (value: unknown): Date | null => {
  const text = readText(value);

  if (!text) {
    return null;
  }

  const parsed = new Date(text);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const requireText = (value: unknown, field: string, orderId: string): string => {
  const text = readText(value);

  if (text === null) {
    throw new OrderParseError(orderId, field);
  }

  return text;
};

const requireDate = (value: unknown, field: string, orderId: string): Date => {
  const parsed = readDate(value);

  if (!parsed) {
    throw new OrderParseError(orderId, field);
  }

  return parsed;
};

const requireNumber = (value: unknown, field: string, orderId: string): number => {
  const parsed = readNumber(value);

  if (parsed === null) {
    throw new OrderParseError(orderId, field);
  }

  return parsed;
};

/** Незнакомое значение чужого словаря: записывается как есть, попадает в счётчик. */
const noteUnknown = (
  known: Set<string>,
  value: string,
  dictionary: string,
  unknown: Set<string>,
): string => {
  if (!known.has(value)) {
    unknown.add(`${dictionary}=${value}`);
  }

  return value;
};

const parseEvents = (value: unknown, unknown: Set<string>): FleetOrderEvent[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const events: FleetOrderEvent[] = [];

  for (const item of value) {
    const record = readRecord(item);
    const orderStatus = readText(record?.['order_status']);
    const eventAt = readDate(record?.['event_at']);

    // Событие без статуса или без времени не ложится в `xb.trip_events`: его уникальность
    // построена ровно на этой паре. Заказ из-за него не теряется — теряется одна строка
    // истории статусов, и это дешевле, чем потерянный заказ.
    if (!orderStatus || !eventAt) {
      continue;
    }

    events.push({ orderStatus: noteUnknown(KNOWN_STATUSES, orderStatus, 'event_status', unknown), eventAt });
  }

  return events;
};

const parseRoutePoints = (value: unknown): FleetRoutePoint[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const points: FleetRoutePoint[] = [];

  for (const [index, item] of value.entries()) {
    const record = readRecord(item);
    const address = readText(record?.['address']);
    const lat = readNumber(record?.['lat']);
    const lon = readNumber(record?.['lon']);

    if (address === null || lat === null || lon === null) {
      continue;
    }

    // Номер точки — её место в присланном маршруте, а не позиция среди уцелевших после
    // разбора. Считать по уцелевшим нельзя: отброшенная первая точка сдвинула бы вторую
    // на `seq = 1`, и когда API вернёт первую целой, upsert по паре `(trip_id, seq)`
    // перепишет адрес не той точке.
    points.push({ seq: index + 1, address, lat, lon });
  }

  return points;
};

export const parseOrder = (raw: RawOrder, unknown: Set<string>): FleetOrder => {
  const orderId = readText(raw['id']);

  if (!orderId) {
    throw new OrderParseError('(без id)', 'id');
  }

  const driverProfile = readRecord(raw['driver_profile']);
  const car = readRecord(raw['car']);
  const carLicense = readRecord(car?.['license']);
  const addressFrom = readRecord(raw['address_from']);
  const orderType = readRecord(raw['type']);
  const workRule = readRecord(raw['driver_work_rule']);

  return {
    orderId,
    shortId: readNumber(raw['short_id']),
    profileId: requireText(driverProfile?.['id'], 'driver_profile.id', orderId),
    status: noteUnknown(KNOWN_STATUSES, requireText(raw['status'], 'status', orderId), 'status', unknown),
    category: noteUnknown(
      KNOWN_CATEGORIES,
      requireText(raw['category'], 'category', orderId),
      'category',
      unknown,
    ),
    paymentMethod: noteUnknown(
      KNOWN_PAYMENT_METHODS,
      requireText(raw['payment_method'], 'payment_method', orderId),
      'payment_method',
      unknown,
    ),
    provider: requireText(raw['provider'], 'provider', orderId),
    orderTypeId: readText(orderType?.['id']),
    orderTypeName: readText(orderType?.['name']),
    workRuleId: readText(workRule?.['id']),
    bookedAt: requireDate(raw['booked_at'], 'booked_at', orderId),
    apiCreatedAt: requireDate(raw['created_at'], 'created_at', orderId),
    // Есть в живом ответе, но не описан документацией. Вместе с `booked_at` и `ended_at`
    // даёт полную временную картину поездки, а не две точки.
    drivingAt: readDate(raw['driving_at']),
    endedAt: readDate(raw['ended_at']),
    price: requireText(raw['price'], 'price', orderId),
    mileage: readText(raw['mileage']),
    carId: requireText(car?.['id'], 'car.id', orderId),
    carCallsign: readText(car?.['callsign']),
    carLicenseNumber: requireText(carLicense?.['number'], 'car.license.number', orderId),
    carBrandModel: requireText(car?.['brand_model'], 'car.brand_model', orderId),
    addressFromText: requireText(addressFrom?.['address'], 'address_from.address', orderId),
    addressFromLat: requireNumber(addressFrom?.['lat'], 'address_from.lat', orderId),
    addressFromLon: requireNumber(addressFrom?.['lon'], 'address_from.lon', orderId),
    cancellationDescription: readText(raw['cancellation_description']),
    flags: readStringArray(raw['flags']),
    amenities: readStringArray(raw['amenities']),
    events: parseEvents(raw['events'], unknown),
    routePoints: parseRoutePoints(raw['route_points']),
  };
};

export const parseOrdersPage = (payload: unknown): OrdersPage => {
  const record = readRecord(payload);
  const rawOrders = Array.isArray(record?.['orders']) ? record['orders'] : [];
  const unknown = new Set<string>();
  const orders: FleetOrder[] = [];
  const malformedIds: MalformedOrder[] = [];

  for (const rawOrder of rawOrders) {
    const asRecord = readRecord(rawOrder);

    if (!asRecord) {
      malformedIds.push(NOT_AN_OBJECT);
      continue;
    }

    try {
      orders.push(parseOrder(asRecord, unknown));
    } catch (error) {
      if (error instanceof OrderParseError) {
        malformedIds.push({ orderId: error.orderId, field: error.field });
        continue;
      }

      throw error;
    }
  }

  return {
    received: rawOrders.length,
    orders,
    cursor: readText(record?.['cursor']),
    unknownValues: [...unknown],
    malformed: malformedIds.length,
    malformedIds,
  };
};

/** Тело запроса. `driver_profile` не передаётся — выборка идёт по всему парку. */
const buildRequestBody = (
  parkId: string,
  window: OrdersWindow,
  pageLimit: number,
  cursor: string | null,
): Record<string, unknown> => ({
  limit: pageLimit,
  query: {
    park: {
      id: parkId,
      order: {
        // Время уходит в UTC: API отдаёт и фильтрует в UTC, подстановка местного времени
        // сдвинула бы выборку на пять часов (docs/yandex-fleet.md).
        ended_at: { from: window.endedFrom.toISOString(), to: window.endedTo.toISOString() },
      },
    },
  },
  ...(cursor ? { cursor } : {}),
});

/**
 * Читает окно постранично. Фильтры между страницами не меняются — курсор привязан
 * к исходной выборке.
 */
export async function* readOrdersByEndedAt(
  client: FleetTransport,
  window: OrdersWindow,
  pageLimit: number,
): AsyncGenerator<OrdersPage> {
  let cursor: string | null = null;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await client.post(
      ORDERS_PATH,
      buildRequestBody(client.parkId, window, pageLimit, cursor),
      `заказы, страница ${page}`,
    );

    const parsed = parseOrdersPage(payload);
    yield parsed;

    cursor = parsed.cursor;

    // Курсор без заказов означает конец выборки: следующая страница пуста. Считаем
    // по пришедшим заказам, а не по разобранным: страница, целиком не поддавшаяся
    // разбору, — это повод остановить не обход, а разбор.
    if (!cursor || parsed.received === 0) {
      return;
    }
  }

  throw new Error(`обход заказов упёрся в предохранитель на ${MAX_PAGES} страницах`);
}
