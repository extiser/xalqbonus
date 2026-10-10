import { computed, type ComputedRef } from 'vue';

/** Сколько после того, как подпись погасла, следующая показывается без задержки. */
const WARM_MS = 300;

/**
 * Какая подпись при наведении открыта — одна на страницу (issue #457), по образцу `useMetricInfo`.
 *
 * Общим состоянием, а не каждая сама: открытие новой закрывает прежнюю без того, чтобы подписи
 * знали друг о друге. Ключ — номер подписи на странице (`useId` в `Tooltip`).
 *
 * Здесь же — когда погасла последняя: мышь, переехавшая со значка на соседний, не ждёт задержку
 * второй раз. Промежуток общий на страницу, поэтому и он живёт здесь, а не в подписи.
 */
export const useWebTooltip = (
  id: string,
): { open: ComputedRef<boolean>; warm: () => boolean; show: () => void; hide: () => void } => {
  const openId = useState<string | null>('web-tooltip-open', () => null);
  const closedAt = useState<number | null>('web-tooltip-closed-at', () => null);

  return {
    open: computed(() => openId.value === id),
    warm: () => closedAt.value !== null && Date.now() - closedAt.value < WARM_MS,
    show: () => {
      openId.value = id;
    },
    hide: () => {
      if (openId.value !== id) return;
      openId.value = null;
      closedAt.value = Date.now();
    },
  };
};
