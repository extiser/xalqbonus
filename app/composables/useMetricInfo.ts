import { computed, type ComputedRef } from 'vue';

/**
 * Какая подсказка метрики открыта — одна на страницу (`codex.md`, «Подсказка метрики»).
 *
 * Общим состоянием, а не каждая сама: открытие новой закрывает прежнюю без того, чтобы
 * подсказки знали друг о друге. Ключ — номер значка на странице (`useId` в `MetricInfo`),
 * а не метрики: одна метрика бывает подписана на экране дважды.
 */
export const useMetricInfo = (
  id: string,
): { open: ComputedRef<boolean>; toggle: () => void; close: () => void } => {
  const openId = useState<string | null>('web-metric-info-open', () => null);

  return {
    open: computed(() => openId.value === id),
    toggle: () => {
      openId.value = openId.value === id ? null : id;
    },
    close: () => {
      if (openId.value === id) openId.value = null;
    },
  };
};
