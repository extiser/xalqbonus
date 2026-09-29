import { computed, ref } from 'vue';
import type { DeskCustomer, DeskOfferedProduct } from '~/types/deskOrder';
import type { LoadState } from '~/types/loadState';
import type { OrderLineListItem } from '~/types/orderLineList';
import { failureCode, failureText } from '~/utils/requestError';
import type { DriverSearchResponse, DriverSearchRow } from '#shared/types/driver';
import type {
  DeskOrderRequestBody,
  DeskProduct,
  DeskProductsResponse,
  OfficeOrder,
  OfficeOrderResponse,
} from '#shared/types/orders';

/**
 * Оформление заказа у стойки в вебе (issue #294): водитель поиском → способ оплаты → товары
 * офиса → итог и подтверждение.
 *
 * Состояние шагов живёт здесь, а не в странице и не в компоненте: компонент за данными
 * не ходит (docs/frontend.md → «Данные в компоненты не ходят»), а страница «Заказы» и так
 * держит список, стойку по коду и выбор офиса.
 *
 * Что можно, решает сервер: уволенный, водитель без счёта за баллы, товар без розничной цены —
 * всё это он отказывает своим кодом. Экран по тем же признакам не даёт выбрать недопустимое,
 * чтобы у стойки не нажимали кнопку ради отказа.
 */

/** Сколько строк поиска показать: выбирают одного, листать незачем. */
const SEARCH_LIMIT = 10;

/** Отказы, после которых список товаров устарел: перечитываем его сразу. */
const STALE_PRODUCTS_CODES = new Set(['insufficient_stock', 'product_unavailable']);

export type DeskPayment = DeskOrderRequestBody['payment'];

const rowName = (row: DriverSearchRow): string =>
  [row.lastName, row.firstName, row.middleName].filter((part): part is string => Boolean(part)).join(' ') ||
  'Без имени';

/** Цена товара в способе оплаты. `null` — в этом способе товар не продаётся. */
const priceFor = (product: DeskProduct, payment: DeskPayment): number | null =>
  payment === 'points' ? product.pricePoints : product.priceRetail;

export const useDeskOrder = () => {
  const isOpen = ref(false);
  const officeId = ref('');

  const searchState = ref<LoadState | null>(null);
  const searchRows = ref<DriverSearchRow[]>([]);

  const customer = ref<DeskCustomer | null>(null);
  const payment = ref<DeskPayment | null>(null);

  const productsState = ref<LoadState>('loading');
  const products = ref<DeskProduct[]>([]);
  /** Набранное количество по товару — строкой, как у числового поля. */
  const quantities = ref<Record<string, string>>({});

  const confirming = ref(false);
  const submitting = ref(false);
  const error = ref<string | null>(null);

  const loadProducts = async (): Promise<void> => {
    productsState.value = 'loading';

    try {
      const response = await $fetch<DeskProductsResponse>('/api/desk/products', {
        query: { officeId: officeId.value },
      });

      products.value = response.products;
      productsState.value = 'ready';
    } catch {
      products.value = [];
      productsState.value = 'error';
    }
  };

  const open = (forOfficeId: string): void => {
    officeId.value = forOfficeId;
    searchState.value = null;
    searchRows.value = [];
    customer.value = null;
    payment.value = null;
    quantities.value = {};
    confirming.value = false;
    error.value = null;
    isOpen.value = true;
    void loadProducts();
  };

  const close = (): void => {
    if (submitting.value) {
      return;
    }

    isOpen.value = false;
  };

  const search = async (query: string): Promise<void> => {
    if (query.trim() === '') {
      return;
    }

    searchState.value = 'loading';

    try {
      const result = await $fetch<DriverSearchResponse>('/api/drivers', {
        query: { query, limit: SEARCH_LIMIT, offset: 0 },
      });

      searchRows.value = result.rows;
      searchState.value = 'ready';
    } catch {
      searchRows.value = [];
      searchState.value = 'error';
    }
  };

  /** Уволенного не выбрать: он виден, чтобы было понятно, с кем разговор. */
  const pick = (row: DriverSearchRow): void => {
    if (row.fired) {
      return;
    }

    customer.value = {
      personId: row.personId,
      name: rowName(row),
      callsign: row.callsigns[0] ?? null,
      isMember: row.isMember,
      isDemo: row.isDemo,
      balance: row.balance,
    };
    searchRows.value = [];
    searchState.value = null;
    // Без счёта за баллы нельзя — розница остаётся единственным способом, выбираем её сразу.
    payment.value = row.balance === null ? 'retail' : null;
    quantities.value = {};
    confirming.value = false;
    error.value = null;
  };

  const clearCustomer = (): void => {
    customer.value = null;
    payment.value = null;
    quantities.value = {};
    confirming.value = false;
    error.value = null;
  };

  const choosePayment = (value: DeskPayment): void => {
    if (value === 'points' && customer.value?.balance === null) {
      return;
    }

    // Способы не смешиваются, и набранное в одной валюте в другую не переносится: у товара
    // другая цена, а может не быть её вовсе.
    if (payment.value !== value) {
      quantities.value = {};
    }

    payment.value = value;
    confirming.value = false;
    error.value = null;
  };

  const setQuantity = (productId: string, value: string): void => {
    quantities.value = { ...quantities.value, [productId]: value };
    confirming.value = false;
  };

  /** Товары офиса в выбранном способе: без цены в нём не предлагаются вовсе. */
  const offered = computed<DeskOfferedProduct[]>(() => {
    const chosen = payment.value;

    if (chosen === null) {
      return [];
    }

    return products.value.flatMap((product) => {
      const unitPrice = priceFor(product, chosen);

      return unitPrice === null
        ? []
        : [{ productId: product.productId, name: product.name, unitPrice, available: product.available }];
    });
  });

  const lines = computed<OrderLineListItem[]>(() =>
    offered.value.flatMap((product) => {
      const quantity = Number.parseInt(quantities.value[product.productId] ?? '', 10);

      return Number.isInteger(quantity) && quantity > 0
        ? [{ productId: product.productId, name: product.name, quantity, unitPrice: product.unitPrice }]
        : [];
    }),
  );

  const total = computed(() => lines.value.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));

  const overStock = computed(() =>
    lines.value.some(
      (line) => line.quantity > (offered.value.find((product) => product.productId === line.productId)?.available ?? 0),
    ),
  );

  const overBalance = computed(
    () => payment.value === 'points' && customer.value?.balance != null && total.value > customer.value.balance,
  );

  const canSubmit = computed(
    () => customer.value !== null && payment.value !== null && lines.value.length > 0 && !overStock.value && !overBalance.value,
  );

  /**
   * Оформляет. Повторное нажатие во время запроса ничего не шлёт: второй заказ здесь неотличим
   * от ошибки кода. Возвращает оформленный заказ; `null` — отказ, текст уже на экране.
   */
  const submit = async (): Promise<OfficeOrder | null> => {
    if (submitting.value || !canSubmit.value || customer.value === null || payment.value === null) {
      return null;
    }

    submitting.value = true;
    error.value = null;

    try {
      const body: DeskOrderRequestBody = {
        officeId: officeId.value,
        personId: customer.value.personId,
        payment: payment.value,
        items: lines.value.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      };
      const response = await $fetch<OfficeOrderResponse>('/api/orders', { method: 'POST', body });

      isOpen.value = false;

      return response.order;
    } catch (failure) {
      error.value = failureText(failure);
      confirming.value = false;

      if (STALE_PRODUCTS_CODES.has(failureCode(failure) ?? '')) {
        void loadProducts();
      }

      return null;
    } finally {
      submitting.value = false;
    }
  };

  return {
    isOpen,
    searchState,
    searchRows,
    customer,
    payment,
    productsState,
    offered,
    quantities,
    lines,
    total,
    overStock,
    overBalance,
    canSubmit,
    confirming,
    submitting,
    error,
    open,
    close,
    search,
    pick,
    clearCustomer,
    choosePayment,
    setQuantity,
    loadProducts,
    submit,
  };
};
