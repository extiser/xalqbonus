import { computed, ref } from 'vue';
import {
  INIT_DATA_HEADER,
  type MemberOffice,
  type MemberOrder,
  type MemberOrderLine,
  type MiniAppOfficesResponse,
  type MiniAppOrderResponse,
  type MiniAppOrdersResponse,
  type MiniAppPlaceOrderRequestBody,
  type MiniAppShowcaseResponse,
} from '#shared/types/miniapp';
import type { LoadState } from '~/types/loadState';
import { failureMessage } from '~/utils/requestError';

/**
 * Обмен баллов в Mini App: офисы, витрина с корзиной, оформление, «Мои заказы» и отмена.
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

  // Офисы ------------------------------------------------------------------

  const officesState = ref<LoadState>('loading');
  const offices = ref<MemberOffice[]>([]);

  const loadOffices = async (): Promise<void> => {
    officesState.value = 'loading';

    try {
      const response = await $fetch<MiniAppOfficesResponse>('/api/miniapp/offices', {
        headers: headers(),
      });

      offices.value = response.offices;
      officesState.value = 'ready';
    } catch (error) {
      console.error('[miniapp] не удалось загрузить офисы', error);
      officesState.value = 'error';
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

  const loadOrders = async (): Promise<void> => {
    ordersState.value = 'loading';

    try {
      const response = await $fetch<MiniAppOrdersResponse>('/api/miniapp/orders', {
        headers: headers(),
      });

      orders.value = response.orders;
      ordersState.value = 'ready';
    } catch (error) {
      console.error('[miniapp] не удалось загрузить заказы', error);
      ordersState.value = 'error';
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
    officesState,
    offices,
    loadOffices,
    showcaseState,
    showcase,
    showcaseError,
    quantities,
    openShowcase,
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
    cancelling,
    cancelError,
    cancel,
    resetCancelError,
  };
};
