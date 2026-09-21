import { ref } from 'vue';
import type { LoadState } from '~/types/loadState';
import { failureText } from '~/utils/requestError';
import type {
  OfficeOrder,
  OfficeOrderResponse,
  OfficeOrdersResponse,
} from '#shared/types/orders';
import type { DeskItemResponse, OfficeRewardResponse } from '#shared/types/rewards';

/**
 * Стойка выдачи: заказ или награда по коду, выдача, отмена заказа и висящие заказы офиса.
 *
 * Поле кода одно на заказы и награды (issue #172): сотрудник набирает пять цифр и не решает
 * заранее, что перед ним. Ответ размечен `kind`, и открытое на карточке — тоже.
 *
 * Один на обе двери, как и ручки под ним: Mini App передаёт заголовок с `initData`, веб —
 * ничего, за него говорит cookie. Больше двери здесь не различаются ничем
 * (docs/decisions.md → «Доступ определяется ролью, а не дверью»).
 *
 * Запросы живут здесь, а не в компонентах: экраны получают готовое свойствами и отдают
 * нажатия событиями (docs/frontend.md → «Данные в компоненты не ходят»). Тексты отказов
 * приходят с сервера, запасной — из словаря веба (`failureText`).
 *
 * Отказ сначала отдаётся странице через `reportDenial`: отказ двери ли это и что тогда
 * делать с экраном, решает она, одна на все ручки. Взяла — строки у поля нет, экран уже
 * не этот; не взяла — отказ доменный и остаётся строкой рядом с полем. Веб не передаёт
 * ничего: там отказы двери разбирает общая проверка маршрута.
 */
export const useOfficeDesk = (
  readHeaders: () => Record<string, string>,
  reportDenial: (error: unknown) => boolean = () => false,
) => {
  /** Что открыто карточкой: найденное по коду или заказ, выбранный из списка. */
  const current = ref<DeskItemResponse | null>(null);

  const searching = ref(false);
  const searchError = ref<string | null>(null);

  /** Запрос выдачи или отмены в пути: второе нажатие второго запроса не шлёт. */
  const acting = ref(false);
  const actionError = ref<string | null>(null);

  /** Итог последнего действия — «Выдано, № 1042». Снимается следующим поиском. */
  const notice = ref<string | null>(null);

  const findByCode = async (officeId: string, code: string): Promise<DeskItemResponse | null> => {
    if (searching.value) {
      return null;
    }

    searching.value = true;
    searchError.value = null;
    notice.value = null;

    try {
      const response = await $fetch<DeskItemResponse>('/api/desk/by-code', {
        headers: readHeaders(),
        query: { officeId, code },
      });

      current.value = response;
      actionError.value = null;

      return response;
    } catch (error) {
      if (reportDenial(error)) {
        return null;
      }

      searchError.value = failureText(error);

      return null;
    } finally {
      searching.value = false;
    }
  };

  /** Открывает заказ из списка висящих. */
  const open = (order: OfficeOrder): void => {
    current.value = { kind: 'order', order };
    actionError.value = null;
    notice.value = null;
  };

  const close = (): void => {
    current.value = null;
    actionError.value = null;
  };

  /** Шлёт действие и возвращает то, что ответил сервер. `null` — отказ, текст уже на экране. */
  const act = async <Result>(request: () => Promise<Result>): Promise<Result | null> => {
    if (acting.value) {
      return null;
    }

    acting.value = true;
    actionError.value = null;

    try {
      return await request();
    } catch (error) {
      if (reportDenial(error)) {
        return null;
      }

      actionError.value = failureText(error);

      return null;
    } finally {
      acting.value = false;
    }
  };

  /**
   * Выдаёт открытое — заказ или награду. После выдачи карточка закрывается: следующий водитель
   * уже у стойки. `true` — выдано.
   */
  const issue = async (): Promise<boolean> => {
    const item = current.value;

    if (!item) {
      return false;
    }

    if (item.kind === 'order') {
      const response = await act(() =>
        $fetch<OfficeOrderResponse>(`/api/orders/${item.order.orderId}/issue`, {
          method: 'POST',
          headers: readHeaders(),
        }),
      );

      if (!response) {
        return false;
      }

      current.value = null;
      notice.value = `Выдано, № ${response.order.number}`;

      return true;
    }

    const response = await act(() =>
      $fetch<OfficeRewardResponse>(`/api/rewards/${item.reward.rewardId}/issue`, {
        method: 'POST',
        headers: readHeaders(),
      }),
    );

    if (!response) {
      return false;
    }

    current.value = null;
    notice.value = `Выдана награда: ${response.reward.title}`;

    return true;
  };

  /** Отменяет открытый заказ. У награды отмены нет: неполученная сгорает сама. */
  const cancel = async (): Promise<boolean> => {
    const item = current.value;

    if (!item || item.kind !== 'order') {
      return false;
    }

    const response = await act(() =>
      $fetch<OfficeOrderResponse>(`/api/orders/${item.order.orderId}/cancel`, {
        method: 'POST',
        headers: readHeaders(),
      }),
    );

    if (!response) {
      return false;
    }

    current.value = null;
    notice.value = `Отменено, № ${response.order.number}: баллы и товар вернулись`;

    return true;
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
      if (reportDenial(error)) {
        return;
      }

      console.error('[orders] не удалось загрузить висящие заказы', error);
      pendingState.value = 'error';
    }
  };

  /** Сбрасывает стойку при смене офиса: найденное и итоги прошлого офиса к новому не относятся. */
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
