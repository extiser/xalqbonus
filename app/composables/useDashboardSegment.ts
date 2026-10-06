import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { failureText } from '~/utils/requestError';
import { SEGMENT_ROLES } from '#shared/access';
import type { DashboardSegmentRequestBody } from '#shared/types/dashboard';
import type { SegmentResponse } from '#shared/types/segment';

/**
 * «Сделать сегмент» у списков дашборда (issue #415) — лидеров на «Рычагах» и новичков на «Глубине»:
 * нажал — сегмент-список заведён, переход на его страницу. Отказ остаётся строкой под шапкой
 * списка, кнопка снова нажимается.
 *
 * Запрос живёт здесь, а не в списке: компонент за данными не ходит (docs/frontend.md → «Данные
 * в компоненты не ходят»). Месяц — тот же, что у ссылки выгрузки: выбранный на экране.
 *
 * Роль — из ответа о вошедшем, как у «Сегмента из итогов» опроса: заводят сегмент те же роли,
 * что в разделе «Сегменты». Решает всё равно ручка.
 */

export type DashboardSegmentList = 'leaders' | 'newcomers';

export type DashboardSegmentAction = {
  /** У сотрудника роль, которой можно заводить сегменты. */
  allowed: ComputedRef<boolean>;
  creating: Ref<boolean>;
  error: Ref<string | null>;
  create: () => Promise<void>;
};

export const useDashboardSegment = (
  list: DashboardSegmentList,
  month: Ref<string | null>,
): DashboardSegmentAction => {
  const employee = useCurrentEmployee();

  const allowed = computed(() => employee.value !== null && SEGMENT_ROLES.includes(employee.value.role));

  const creating = ref(false);
  const error = ref<string | null>(null);

  // Отказ — про список того месяца, на котором нажали; у другого месяца его нет.
  watch(month, () => {
    error.value = null;
  });

  const create = async (): Promise<void> => {
    const value = month.value;

    if (!value || creating.value) {
      return;
    }

    creating.value = true;
    error.value = null;

    try {
      const created = await $fetch<SegmentResponse>(`/api/dashboard/${list}/segment`, {
        method: 'POST',
        body: { month: value } satisfies DashboardSegmentRequestBody,
      });

      await navigateTo(`/segments/${created.segment.segmentId}`);
    } catch (failure) {
      error.value = failureText(failure);
    } finally {
      creating.value = false;
    }
  };

  return { allowed, creating, error, create };
};
