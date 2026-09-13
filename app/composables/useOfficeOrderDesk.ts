import { ref } from 'vue';
import type { LoadState } from '~/types/loadState';
import { failureText } from '~/utils/requestError';
import type {
  OfficeOrder,
  OfficeOrderResponse,
  OfficeOrdersResponse,
} from '#shared/types/orders';

/**
 * Стойка выдачи: заказ по коду, выдача, отмена и висящие заказы офиса.
 *
 * Один на обе двери, как и ручки под ним: Mini App передаёт заголовок с `initData`, веб —
 * ничего, за него говорит cookie. Больше двери здесь не различаются ничем
 * (docs/decisions.md → «Доступ определяется ролью, а не дверью»).
 *
 * Запросы живут здесь, а не в компонентах: экраны получают готовое свойствами и отдают
 * нажатия событиями (docs/frontend.md → «Данные в компоненты не ходят»). Тексты отказов
 * приходят с сервера, запасной — из словаря веба (`failureText`).
 */
export const useOfficeOrderDesk = (readHeaders: () => Record<string, string>) => {
  /** Заказ, открытый карточкой: найденный по коду или выбранный из списка. */
  const current = ref<OfficeOrder | null>(null);

  const searching = ref(false);
  const searchError = ref<string | null>(null);

  /** Запрос выдачи или отмены в пути: второе нажатие второго запроса не шлёт. */
  const acting = ref(false);
  const actionError = ref<string | null>(null);

  /** Итог последнего действия — «Выдано, № 1042». Снимается следующим поиском. */
  const notice = ref<string | null>(null);

  const findByCode = async (officeId: string, code: string): Promise<OfficeOrder | null> => {
    if (searching.value) {
      return null;
    }

    searching.value = true;
    searchError.value = null;
    notice.value = null;

    try {
      const response = await $fetch<OfficeOrderResponse>('/api/orders/by-code', {
        headers: readHeaders(),
        query: { officeId, code },
      });

      current.value = response.order;
      actionError.value = null;

      return response.order;
    } catch (error) {
      searchError.value = failureText(error);

      return null;
    } finally {
      searching.value = false;
    }
  };

  const open = (order: OfficeOrder): void => {
    current.value = order;
    actionError.value = null;
    notice.value = null;
  };

  const close = (): void => {
    current.value = null;
    actionError.value = null;
  };

  const act = async (action: 'issue' | 'cancel'): Promise<OfficeOrder | null> => {
    const order = current.value;

    if (!order || acting.value) {
      return null;
    }

    acting.value = true;
    actionError.value = null;

    try {
      const response = await $fetch<OfficeOrderResponse>(
        `/api/orders/${order.orderId}/${action}`,
        { method: 'POST', headers: readHeaders() },
      );

      return response.order;
    } catch (error) {
      actionError.value = failureText(error);

      return null;
    } finally {
      acting.value = false;
    }
  };

  /** Выдаёт открытый заказ. После выдачи карточка закрывается: следующий водитель уже у стойки. */
  const issue = async (): Promise<OfficeOrder | null> => {
    const issued = await act('issue');

    if (issued) {
      current.value = null;
      notice.value = `Выдано, № ${issued.number}`;
    }

    return issued;
  };

  const cancel = async (): Promise<OfficeOrder | null> => {
    const cancelled = await act('cancel');

    if (cancelled) {
      current.value = null;
      notice.value = `Отменено, № ${cancelled.number}: баллы и товар вернулись`;
    }

    return cancelled;
  };

  // Висящие заказы офиса ---------------------------------------------------

  const pendingState = ref<LoadState>('loading');
  const pendingOrders = ref<OfficeOrder[]>([]);

  /** Потолок ручки: висящих в офисе единицы, и листать их незачем. */
  const PENDING_LIMIT = 100;

  const loadPending = async (officeId: string): Promise<void> => {
    pendingState.value = 'loading';

    try {
      const response = await $fetch<OfficeOrdersResponse>('/api/orders', {
        headers: readHeaders(),
        query: { officeId, status: 'pending', limit: PENDING_LIMIT },
      });

      pendingOrders.value = response.orders;
      pendingState.value = 'ready';
    } catch (error) {
      console.error('[orders] не удалось загрузить висящие заказы', error);
      pendingState.value = 'error';
    }
  };

  /** Сбрасывает стойку при смене офиса: заказ и итоги прошлого офиса к новому не относятся. */
  const reset = (): void => {
    current.value = null;
    searchError.value = null;
    actionError.value = null;
    notice.value = null;
  };

  return {
    current,
    searching,
    searchError,
    acting,
    actionError,
    notice,
    findByCode,
    open,
    close,
    issue,
    cancel,
    pendingState,
    pendingOrders,
    loadPending,
    reset,
  };
};
