import { computed, watch, type ComputedRef, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import type { NavigationCount, NavigationItem } from '~/utils/navigation';
import type { ApplicationWaitingCount } from '#shared/types/applications';

/**
 * Числа счётчиков у пунктов меню — одни на обе раскладки, тёмную и светлую (issue #471).
 *
 * Спрашивает раскладка, а не меню: компонент за данными не ходит (docs/frontend.md → «Данные
 * в компоненты не ходят»). Заявки, ждущие ответа, — только если у роли есть такой пункт,
 * при открытии и на каждой смене страницы: отвеченная заявка уходит из счётчика без
 * перезагрузки. Не ответила ручка — счётчика нет: меню без числа лучше меню с ошибкой.
 */
export const useNavigationCounts = (
  items: Ref<NavigationItem[]>,
): ComputedRef<Partial<Record<NavigationCount, number>>> => {
  const route = useRoute();

  const countsApplications = computed(() => items.value.some((item) => item.count === 'applicationsWaiting'));

  const { data: applicationsWaiting, refresh } = useFetch<ApplicationWaitingCount>('/api/applications/waiting-count', {
    lazy: true,
    server: false,
    immediate: countsApplications.value,
  });

  watch(
    () => route.fullPath,
    () => {
      if (countsApplications.value) void refresh();
    },
  );

  return computed(() => {
    const waiting = applicationsWaiting.value?.count;

    return waiting === undefined || !countsApplications.value ? {} : { applicationsWaiting: waiting };
  });
};
