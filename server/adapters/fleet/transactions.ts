/**
 * Транзакции парка из Fleet API: `POST /v2/parks/transactions/list` и справочник категорий
 * `POST /v2/parks/transactions/categories/list` (issue #358).
 *
 * Выборка идёт по всему парку и только по `event_at`: фильтра по категориям нет, собирается
 * всё — деньги парка и деньги платформы. Пагинация курсорная, `limit` — 1000, максимум метода.
 * Fleet отдаёт страницы от новых транзакций к старым, а на последней странице курсор пуст.
 *
 * Адаптер не знает про базу: наружу отдаётся разобранная структура, а кто и куда её
 * положит — дело сервиса (docs/principles.md → «Слои и зависимости»).
 */
import type { FleetTransport } from '#server/adapters/fleet/client';

const TRANSACTIONS_PATH = '/v2/parks/transactions/list';

const CATEGORIES_PATH = '/v2/parks/transactions/categories/list';

/** Максимум, который принимает метод. */
export const TRANSACTIONS_PAGE_LIMIT = 1_000;

/** Предохранитель от бесконечной пагинации, как у заказов. */
const MAX_PAGES = 2_000;

/**
 * Сумма, которую принимает `numeric(18,4)`: до 14 цифр до точки. Дробная часть длиннее
 * четырёх знаков округляется базой — в живых ответах она ровно четыре знака.
 */
const AMOUNT_PATTERN = /^-?\d{1,14}(\.\d+)?$/;

/** Транзакция в том виде, в каком её кладёт сервис. Сырой ответ не хранится нигде. */
export type FleetTransaction = {
  id: string;
  eventAt: Date;
  categoryId: string;
  /** Число с фиксированной точкой строкой, как его отдаёт API: разбор во float теряет копейки. */
  amount: string;
  currencyCode: string | null;
  driverProfileId: string | null;
  orderId: string | null;
  /**
   * Поле `external_event_id`. Документация Fleet описывает `event_id`, но в живых ответах
   * его нет ни разу — приходит `external_event_id` (проба 04-10-2026, 21 578 транзакций).
   */
  externalEventId: string | null;
  description: string | null;
  /** `identity` из `created_by`. */
  createdBy: string | null;
  /** `dispatcher_name`, когда `identity = dispatcher`. */
  createdByDispatcher: string | null;
};

/**
 * Транзакция, которую нельзя записать осмысленно: нет `id`, `event_at`, `category_id`
 * или сумма не разбирается в число. Не записывается, считается в `malformed`.
 */
export type MalformedTransaction = {
  /** `(без id)`, если разбор споткнулся до идентификатора. */
  transactionId: string;
  field: string;
};

/**
 * Транзакция записана, но без служебного поля — `created_by.identity` или `currency_code`.
 * Не отказ: деньги, выброшенные из-за пустого служебного поля, пропали бы из дашборда.
 * Считается отдельным числом, не `malformed`.
 */
export type IncompleteTransaction = {
  transactionId: string;
  fields: string[];
};

export type TransactionsPage = {
  /** Сколько транзакций пришло в ответе — до разбора. По нему судим о конце выборки. */
  received: number;
  transactions: FleetTransaction[];
  cursor: string | null;
  malformed: number;
  /** Кто именно не разобрался. Длина равна `malformed`. */
  malformedIds: MalformedTransaction[];
  /** Записанные без служебного поля. */
  incomplete: IncompleteTransaction[];
};

export type TransactionsWindow = {
  eventFrom: Date;
  eventTo: Date;
};

export type FleetTransactionCategory = {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  isEnabled: boolean;
  isAffectingDriverBalance: boolean;
};

export type TransactionCategoriesResult = {
  categories: FleetTransactionCategory[];
  /** Категории без обязательного поля: в справочник не ложатся. */
  skipped: number;
};

const readRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readText = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const readDate = (value: unknown): Date | null => {
  const text = readText(value);

  if (!text) {
    return null;
  }

  const parsed = new Date(text);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Что разобралось: транзакция или поле, на котором разбор споткнулся. */
type ParsedTransaction =
  | { kind: 'ok'; transaction: FleetTransaction; missing: string[] }
  | { kind: 'malformed'; field: string };

const parseTransaction = (raw: Record<string, unknown>): ParsedTransaction => {
  const eventAt = readDate(raw['event_at']);

  if (eventAt === null) {
    return { kind: 'malformed', field: 'event_at' };
  }

  const categoryId = readText(raw['category_id']);

  if (categoryId === null) {
    return { kind: 'malformed', field: 'category_id' };
  }

  const amount = readText(raw['amount']);

  if (amount === null || !AMOUNT_PATTERN.test(amount)) {
    return { kind: 'malformed', field: 'amount' };
  }

  const createdBy = readRecord(raw['created_by']);
  const identity = readText(createdBy?.['identity']);
  const currencyCode = readText(raw['currency_code']);
  const missing: string[] = [];

  if (identity === null) {
    missing.push('created_by.identity');
  }

  if (currencyCode === null) {
    missing.push('currency_code');
  }

  return {
    kind: 'ok',
    missing,
    transaction: {
      // `id` проверен вызывающим до разбора остального.
      id: String(raw['id']),
      eventAt,
      categoryId,
      amount,
      currencyCode,
      driverProfileId: readText(raw['driver_profile_id']),
      orderId: readText(raw['order_id']),
      externalEventId: readText(raw['external_event_id']),
      description: readText(raw['description']),
      createdBy: identity,
      createdByDispatcher: identity === 'dispatcher' ? readText(createdBy?.['dispatcher_name']) : null,
    },
  };
};

export const parseTransactionsPage = (payload: unknown): TransactionsPage => {
  const record = readRecord(payload);
  const rawTransactions = Array.isArray(record?.['transactions']) ? record['transactions'] : [];
  const transactions: FleetTransaction[] = [];
  const malformedIds: MalformedTransaction[] = [];
  const incomplete: IncompleteTransaction[] = [];

  for (const rawTransaction of rawTransactions) {
    const asRecord = readRecord(rawTransaction);

    if (!asRecord) {
      malformedIds.push({ transactionId: '(без id)', field: '(запись не объект)' });
      continue;
    }

    const transactionId = readText(asRecord['id']);

    if (transactionId === null) {
      malformedIds.push({ transactionId: '(без id)', field: 'id' });
      continue;
    }

    const parsed = parseTransaction(asRecord);

    if (parsed.kind === 'malformed') {
      malformedIds.push({ transactionId, field: parsed.field });
      continue;
    }

    transactions.push(parsed.transaction);

    if (parsed.missing.length > 0) {
      incomplete.push({ transactionId, fields: parsed.missing });
    }
  }

  return {
    received: rawTransactions.length,
    transactions,
    cursor: readText(record?.['cursor']),
    malformed: malformedIds.length,
    malformedIds,
    incomplete,
  };
};

/** Тело запроса: фильтр только по `event_at`, `category_ids` не передаётся — собирается всё. */
const buildRequestBody = (
  parkId: string,
  window: TransactionsWindow,
  cursor: string | null,
): Record<string, unknown> => ({
  limit: TRANSACTIONS_PAGE_LIMIT,
  query: {
    park: {
      id: parkId,
      transaction: {
        // Время уходит в UTC: API отдаёт и фильтрует в UTC (docs/yandex-fleet.md).
        event_at: { from: window.eventFrom.toISOString(), to: window.eventTo.toISOString() },
      },
    },
  },
  ...(cursor ? { cursor } : {}),
});

export type ReadTransactionsOptions = {
  /**
   * Курсор, с которого продолжить обход, — из ответа на страницу, прочитанную раньше.
   * Окно обязано быть тем же, что у того обхода: курсор привязан к выборке.
   */
  startCursor?: string | null;
  /** Номер первой запрашиваемой страницы: при продолжении счёт в описании запроса идёт дальше. */
  startPage?: number;
};

/**
 * Читает окно постранично. Фильтр между страницами не меняется — курсор привязан
 * к исходной выборке. Конец выборки — пустой курсор или пустая страница.
 */
export async function* readTransactionsByEventAt(
  client: FleetTransport,
  window: TransactionsWindow,
  options: ReadTransactionsOptions = {},
): AsyncGenerator<TransactionsPage> {
  let cursor: string | null = options.startCursor ?? null;

  for (let page = options.startPage ?? 1; page <= MAX_PAGES; page += 1) {
    const payload = await client.post(
      TRANSACTIONS_PATH,
      buildRequestBody(client.parkId, window, cursor),
      `транзакции, страница ${page}`,
    );

    const parsed = parseTransactionsPage(payload);
    yield parsed;

    cursor = parsed.cursor;

    // Считаем по пришедшим, а не по разобранным: страница, целиком не поддавшаяся
    // разбору, — повод остановить не обход, а разбор.
    if (!cursor || parsed.received === 0) {
      return;
    }
  }

  throw new Error(`обход транзакций упёрся в предохранитель на ${MAX_PAGES} страницах`);
}

const parseCategory = (value: unknown): FleetTransactionCategory | null => {
  const record = readRecord(value);
  const id = readText(record?.['id']);
  const name = readText(record?.['name']);
  const groupId = readText(record?.['group_id']);
  const groupName = readText(record?.['group_name']);
  const isEnabled = record?.['is_enabled'];
  const isAffectingDriverBalance = record?.['is_affecting_driver_balance'];

  if (
    id === null ||
    name === null ||
    groupId === null ||
    groupName === null ||
    typeof isEnabled !== 'boolean' ||
    typeof isAffectingDriverBalance !== 'boolean'
  ) {
    return null;
  }

  return { id, name, groupId, groupName, isEnabled, isAffectingDriverBalance };
};

/** Справочник категорий парка целиком, без фильтров. */
export const readTransactionCategories = async (
  client: FleetTransport,
): Promise<TransactionCategoriesResult> => {
  const payload = await client.post(
    CATEGORIES_PATH,
    { query: { park: { id: client.parkId } } },
    'категории транзакций',
  );
  const rawCategories = readRecord(payload)?.['categories'];
  const categories: FleetTransactionCategory[] = [];
  let skipped = 0;

  for (const rawCategory of Array.isArray(rawCategories) ? rawCategories : []) {
    const category = parseCategory(rawCategory);

    if (category === null) {
      skipped += 1;
      continue;
    }

    categories.push(category);
  }

  return { categories, skipped };
};
