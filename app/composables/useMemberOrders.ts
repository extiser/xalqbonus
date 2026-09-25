import { computed, ref } from 'vue';
import {
  INIT_DATA_HEADER,
  type MemberOrder,
  type MemberOrderLine,
  type MiniAppCatalogResponse,
  type MiniAppLatestProductsResponse,
  type MiniAppOrderResponse,
  type MiniAppOrdersResponse,
  type MiniAppPlaceOrderRequestBody,
  type MiniAppShowcaseResponse,
} from '#shared/types/miniapp';
import type { LoadState } from '~/types/loadState';
import { failureMessage } from '~/utils/requestError';

/**
 * Обмен баллов в Mini App: товары для блока каталога на главной, общий каталог без офиса,
 * витрина офиса с корзиной, оформление, «Мои заказы» и отмена.
 *
 * Запросы живут здесь, а не в компонентах: экраны получают готовое свойствами и отдают
 * нажатия событиями (docs/frontend.md → «Данные в компоненты не ходят»).
 *
 * Корзина — только количество по товару. Цена, остаток и баланс на экране — подсказка
 * водителю, а не решение: всё это перепроверяет `placeOrder` одной транзакцией, и отказ
 * приходит кодом с текстом на его языке.
 *
 * Запасной текст отказа берётся вызовом, как и подписанная строка: тексты приезжают
 * с экраном участника, позже, чем создаётся composable.
 */
export const useMemberOrders = (readInitData: () => string, readRequestFailed: () => string) => {
  const headers = () => ({ [INIT_DATA_HEADER]: readInitData() });

  /** Текст отказа: присланный сервером, а если ответа не было — свой запасной. */
  const failureTextOf = (error: unknown): string => failureMessage(error) ?? readRequestFailed();

  // Блок каталога на главной ----------------------------------------------

  const latestState = ref<LoadState>('loading');
  const latestProducts = ref<MiniAppLatestProductsResponse['products']>([]);

  const fetchLatest = async (): Promise<void> => {
    const response = await $fetch<MiniAppLatestProductsResponse>('/api/miniapp/catalog/latest', {
      headers: headers(),
    });

    latestProducts.value = response.products;
    latestState.value = 'ready';
  };

  const loadLatest = async (): Promise<void> => {
    latestState.value = 'loading';

    try {
      await fetchLatest();
    } catch (error) {
      console.error('[miniapp] не удалось загрузить товары главной', error);
      latestState.value = 'error';
    }
  };

  /** Тихое перечитывание — тем же правилом, что у заказов: отказ показанное не гасит. */
  const reloadLatest = async (): Promise<void> => {
    try {
      await fetchLatest();
    } catch (error) {
      console.error('[miniapp] не удалось перечитать товары главной', error);
    }
  };

  // Общий каталог без офиса ----------------------------------------------

  /**
   * Каталог — все товары, которые есть хотя бы в одном работающем офисе, и все офисы (issue #234).
   * Им открывается каталог, из него шторка «Где заберёте?» берёт офисы товара, а «Выбрать»
   * и «Сменить» — список офисов.
   */
  const catalogState = ref<LoadState>('loading');
  const catalog = ref<MiniAppCatalogResponse | null>(null);

  const fetchCatalog = async (): Promise<void> => {
    catalog.value = await $fetch<MiniAppCatalogResponse>('/api/miniapp/catalog', {
      headers: headers(),
    });
    catalogState.value = 'ready';
  };

  const loadCatalog = async (): Promise<void> => {
    catalogState.value = 'loading';
    catalog.value = null;

    try {
      await fetchCatalog();
    } catch (error) {
      console.error('[miniapp] не удалось загрузить каталог', error);
      catalogState.value = 'error';
    }
  };

  /**
   * Тихое перечитывание — для шторки «товар закончился»: остатки в ней должны стать свежими,
   * а каталог под шторкой — не мигать загрузкой. Отказ показанное не гасит: строка о том,
   * что товар кончился, уже стоит.
   */
  const reloadCatalog = async (): Promise<void> => {
    try {
      await fetchCatalog();
    } catch (error) {
      console.error('[miniapp] не удалось перечитать каталог', error);
    }
  };

  // Витрина и корзина ------------------------------------------------------

  const showcaseState = ref<LoadState>('loading');
  const showcase = ref<MiniAppShowcaseResponse | null>(null);

  /**
   * Текст отказа витрины от сервера: архивный офис говорит своими словами. `null` — ответа
   * не было, и экран показывает свой «не удалось загрузить».
   */
  const showcaseError = ref<string | null>(null);

  /** Сколько штук каждого товара выбрано. Нет ключа — ноль. */
  const quantities = ref<Record<string, number>>({});

  const fetchShowcase = (officeId: string): Promise<MiniAppShowcaseResponse> =>
    $fetch<MiniAppShowcaseResponse>(`/api/miniapp/offices/${officeId}/products`, {
      headers: headers(),
    });

  /** Приводит корзину к остаткам витрины: исчезнувший товар уходит, лишние штуки срезаются. */
  const clampQuantities = (current: MiniAppShowcaseResponse): void => {
    const next: Record<string, number> = {};

    for (const product of current.products) {
      const quantity = Math.min(quantities.value[product.productId] ?? 0, product.available);

      if (quantity > 0) {
        next[product.productId] = quantity;
      }
    }

    quantities.value = next;
  };

  /**
   * Витрина офиса без постановки — для «Добавить в корзину» в шторке «Где заберёте?»: сначала
   * проверить, что товар в офисе ещё есть, и только потом закрепить офис (`applyShowcase`).
   * Отказ — текстом сервера или `null`, если ответа не было: экран говорит своими словами.
   */
  const readShowcase = async (
    officeId: string,
  ): Promise<{ showcase: MiniAppShowcaseResponse } | { error: string | null }> => {
    try {
      return { showcase: await fetchShowcase(officeId) };
    } catch (error) {
      console.error('[miniapp] не удалось прочитать витрину офиса', error);

      return { error: failureMessage(error) };
    }
  };

  /** Ставит проверенную витрину без повторного запроса. Корзина — с чистого листа. */
  const applyShowcase = (next: MiniAppShowcaseResponse): void => {
    showcase.value = next;
    showcaseError.value = null;
    showcaseState.value = 'ready';
    quantities.value = {};
  };

  const openShowcase = async (officeId: string): Promise<void> => {
    showcaseState.value = 'loading';
    showcase.value = null;
    showcaseError.value = null;
    quantities.value = {};

    try {
      showcase.value = await fetchShowcase(officeId);
      showcaseState.value = 'ready';
    } catch (error) {
      console.error('[miniapp] не удалось загрузить витрину', error);
      showcaseError.value = failureMessage(error);
      showcaseState.value = 'error';
    }
  };

  /**
   * Тихо перечитывает витрину после отказа оформления.
   *
   * Отказ значит, что мир разошёлся с экраном: товар забрали, баланс изменился, товар ушёл
   * в архив. Водитель вернётся к витрине и должен увидеть уже новые числа, а корзина —
   * не обещать больше, чем лежит на полке. Отказ самого перечитывания молчит: на экране
   * уже стоит текст отказа оформления.
   */
  const reloadShowcase = async (): Promise<void> => {
    const officeId = showcase.value?.office.officeId;

    if (!officeId) {
      return;
    }

    try {
      const fresh = await fetchShowcase(officeId);

      showcase.value = fresh;
      clampQuantities(fresh);
    } catch (error) {
      console.error('[miniapp] не удалось перечитать витрину', error);
    }
  };

  /**
   * Забывает витрину и корзину — при уходе из каталога. Последний офис не запоминается
   * (`_reference/design/catalog/catalog-no-office.md`): следующий вход — снова каталог без офиса.
   */
  const closeShowcase = (): void => {
    showcaseState.value = 'loading';
    showcase.value = null;
    showcaseError.value = null;
    quantities.value = {};
    placeError.value = null;
  };

  /** Ставит количество товара в пределах от нуля до доступного остатка. */
  const setQuantity = (productId: string, quantity: number): void => {
    const product = showcase.value?.products.find((entry) => entry.productId === productId);

    if (!product) {
      return;
    }

    const next = { ...quantities.value };
    const clamped = Math.max(0, Math.min(quantity, product.available));

    if (clamped === 0) {
      delete next[productId];
    } else {
      next[productId] = clamped;
    }

    quantities.value = next;
  };

  /** Позиции корзины в порядке витрины — ими же показывается подтверждение. */
  const cartLines = computed<MemberOrderLine[]>(() =>
    (showcase.value?.products ?? []).flatMap((product) => {
      const quantity = quantities.value[product.productId] ?? 0;

      return quantity > 0
        ? [{ productId: product.productId, name: product.name, quantity, unitPoints: product.pricePoints }]
        : [];
    }),
  );

  const cartTotal = computed(() =>
    cartLines.value.reduce((sum, line) => sum + line.quantity * line.unitPoints, 0),
  );

  // Оформление -------------------------------------------------------------

  /** Запрос в пути: второе нажатие не оформляет второй заказ. */
  const placing = ref(false);
  const placeError = ref<string | null>(null);

  /** Оформляет корзину. `null` — отказ, его текст лежит в `placeError`. */
  const place = async (): Promise<MemberOrder | null> => {
    const current = showcase.value;

    if (!current || placing.value || cartLines.value.length === 0) {
      return null;
    }

    placing.value = true;
    placeError.value = null;

    try {
      const body: MiniAppPlaceOrderRequestBody = {
        officeId: current.office.officeId,
        items: cartLines.value.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
      };
      const response = await $fetch<MiniAppOrderResponse>('/api/miniapp/orders', {
        method: 'POST',
        headers: headers(),
        body,
      });

      quantities.value = {};

      return response.order;
    } catch (error) {
      console.error('[miniapp] заказ не оформился', error);
      placeError.value = failureTextOf(error);
      void reloadShowcase();

      return null;
    } finally {
      placing.value = false;
    }
  };

  const resetPlaceError = (): void => {
    placeError.value = null;
  };

  // Мои заказы и отмена ----------------------------------------------------

  const ordersState = ref<LoadState>('loading');
  const orders = ref<MemberOrder[]>([]);

  const fetchOrders = async (): Promise<void> => {
    const response = await $fetch<MiniAppOrdersResponse>('/api/miniapp/orders', {
      headers: headers(),
    });

    orders.value = response.orders;
    ordersState.value = 'ready';
  };

  const loadOrders = async (): Promise<void> => {
    ordersState.value = 'loading';

    try {
      await fetchOrders();
    } catch (error) {
      console.error('[miniapp] не удалось загрузить заказы', error);
      ordersState.value = 'error';
    }
  };

  /**
   * Тихое перечитывание: показанный список стоит на экране, пока не пришёл новый, — при возврате
   * на экран и из фона водитель ничего не просил, и мигание загрузкой было бы ему непонятно.
   * Отказ список не гасит: показанные заказы были верны минуту назад, а сказать об отказе
   * здесь некому — перечитывание никто не нажимал.
   */
  const reloadOrders = async (): Promise<void> => {
    try {
      await fetchOrders();
    } catch (error) {
      console.error('[miniapp] не удалось перечитать заказы', error);
    }
  };

  const cancelling = ref(false);
  const cancelError = ref<string | null>(null);

  /** Отменяет заказ. `null` — отказ, его текст лежит в `cancelError`. */
  const cancel = async (orderId: string): Promise<MemberOrder | null> => {
    if (cancelling.value) {
      return null;
    }

    cancelling.value = true;
    cancelError.value = null;

    try {
      const response = await $fetch<MiniAppOrderResponse>(
        `/api/miniapp/orders/${orderId}/cancel`,
        { method: 'POST', headers: headers() },
      );

      return response.order;
    } catch (error) {
      console.error('[miniapp] заказ не отменился', error);
      cancelError.value = failureTextOf(error);

      return null;
    } finally {
      cancelling.value = false;
    }
  };

  const resetCancelError = (): void => {
    cancelError.value = null;
  };

  return {
    latestState,
    latestProducts,
    loadLatest,
    reloadLatest,
    catalogState,
    catalog,
    loadCatalog,
    reloadCatalog,
    showcaseState,
    showcase,
    showcaseError,
    quantities,
    readShowcase,
    applyShowcase,
    openShowcase,
    closeShowcase,
    setQuantity,
    cartLines,
    cartTotal,
    placing,
    placeError,
    place,
    resetPlaceError,
    ordersState,
    orders,
    loadOrders,
    reloadOrders,
    cancelling,
    cancelError,
    cancel,
    resetCancelError,
  };
};
