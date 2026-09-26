import { ref } from 'vue';
import type { LoadState } from '~/types/loadState';
import { failureCode, failureText } from '~/utils/requestError';
import type { OfficeOrderResponse } from '#shared/types/orders';
import type { DeskItemResponse, DeskPendingResponse, OfficeRewardResponse } from '#shared/types/rewards';

/**
 * Стойка выдачи: заказ или награда по коду, выдача, отмена заказа и ждущие выдачи в офисе.
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
  /** Что открыто карточкой: найденное по коду или выбранное из списка. */
  const current = ref<DeskItemResponse | null>(null);

  const searching = ref(false);
  const searchError = ref<string | null>(null);

  /** Запрос выдачи или отмены в пути: второе нажатие второго запроса не шлёт. */
  const acting = ref(false);
  const actionError = ref<string | null>(null);

  /** Итог последнего действия — «Выдано, № 1042». Снимается следующим поиском. */
  const notice = ref<string | null>(null);

  /**
   * Что выдано последним — ставится вместе с `notice` и снимается вместе с ним. Из него Mini App
   * собирает свою плашку «Выдано · заказ #N · водитель» (issue #250): у веба строка своя.
   */
  const issued = ref<DeskItemResponse | null>(null);

  /**
   * Код последнего отказа поиска или действия — снимается вместе с его текстом. По нему Mini App
   * узнаёт чужой офис (`office_not_open`) и открывает выбор офиса.
   */
  const denialCode = ref<string | null>(null);

  const findByCode = async (officeId: string, code: string): Promise<DeskItemResponse | null> => {
    if (searching.value) {
      return null;
    }

    searching.value = true;
    searchError.value = null;
    denialCode.value = null;
    notice.value = null;
    issued.value = null;

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
      denialCode.value = failureCode(error);

      return null;
    } finally {
      searching.value = false;
    }
  };

  /** Открывает заказ или награду из списка ждущих. */
  const open = (item: DeskItemResponse): void => {
    current.value = item;
    actionError.value = null;
    denialCode.value = null;
    notice.value = null;
    issued.value = null;
  };

  const close = (): void => {
    current.value = null;
    actionError.value = null;
    denialCode.value = null;
  };

  /** Шлёт действие и возвращает то, что ответил сервер. `null` — отказ, текст уже на экране. */
  const act = async <Result>(request: () => Promise<Result>): Promise<Result | null> => {
    if (acting.value) {
      return null;
    }

    acting.value = true;
    actionError.value = null;
    denialCode.value = null;

    try {
      return await request();
    } catch (error) {
      if (reportDenial(error)) {
        return null;
      }

      actionError.value = failureText(error);
      denialCode.value = failureCode(error);

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
      issued.value = { kind: 'order', order: response.order };

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
    issued.value = { kind: 'reward', reward: response.reward };

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

  // Ждущие выдачи в офисе — заказы и награды -------------------------------

  const pendingState = ref<LoadState>('loading');
  const pendingItems = ref<DeskItemResponse[]>([]);

  /** Список перечитывается тихо: строки стоят до ответа, «Обновить» ждёт. */
  const pendingRefreshing = ref(false);

  /**
   * Номер запроса списка: ответ по прежнему офису, пришедший после смены офиса, свежий
   * не перетирает.
   */
  let pendingRequest = 0;

  const fetchPending = (officeId: string): Promise<DeskPendingResponse> =>
    $fetch<DeskPendingResponse>('/api/desk/pending', {
      headers: readHeaders(),
      query: { officeId },
    });

  /** Ждущие выдачи одним списком, свежие первыми (`GET /api/desk/pending`, issue #250). */
  const loadPending = async (officeId: string): Promise<void> => {
    const request = ++pendingRequest;

    pendingState.value = 'loading';
    pendingRefreshing.value = false;

    try {
      const response = await fetchPending(officeId);

      if (request !== pendingRequest) {
        return;
      }

      pendingItems.value = response.items;
      pendingState.value = 'ready';
    } catch (error) {
      if (request !== pendingRequest || reportDenial(error)) {
        return;
      }

      console.error('[orders] не удалось загрузить ждущие выдачи', error);
      pendingState.value = 'error';
    }
  };

  /**
   * Перечитывает список тихо — «Обновить» у стойки и возврат приложения из фона: строки стоят
   * до ответа, загрузкой экран не мигает. Отказ оставляет прежние строки, причина — в консоли:
   * стерев список, экран соврал бы, что ждущих нет. Список ещё не читался или не прочитался —
   * читается обычным путём, со своими состояниями.
   */
  const reloadPending = async (officeId: string): Promise<void> => {
    if (pendingState.value !== 'ready') {
      await loadPending(officeId);

      return;
    }

    const request = ++pendingRequest;

    pendingRefreshing.value = true;

    try {
      const response = await fetchPending(officeId);

      if (request === pendingRequest) {
        pendingItems.value = response.items;
      }
    } catch (error) {
      if (request === pendingRequest && !reportDenial(error)) {
        console.error('[orders] не удалось перечитать ждущие выдачи', error);
      }
    } finally {
      if (request === pendingRequest) {
        pendingRefreshing.value = false;
      }
    }
  };

  /** Сбрасывает стойку при смене офиса: найденное и итоги прошлого офиса к новому не относятся. */
  const reset = (): void => {
    current.value = null;
    searchError.value = null;
    actionError.value = null;
    denialCode.value = null;
    notice.value = null;
    issued.value = null;
  };

  return {
    current,
    searching,
    searchError,
    acting,
    actionError,
    notice,
    issued,
    denialCode,
    findByCode,
    open,
    close,
    issue,
    cancel,
    pendingState,
    pendingItems,
    pendingRefreshing,
    loadPending,
    reloadPending,
    reset,
  };
};
