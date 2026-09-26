import { ref } from 'vue';
import type { LoadState } from '~/types/loadState';
import type { DeskOffice, DeskOfficesResponse } from '#shared/types/orders';

/**
 * Офисы стойки с числом ждущих выдачи — выбор офиса и шторка «Сменить» в Mini App (issue #250).
 *
 * Читаются заново при каждом показе: число ждущих меняется за день, а менеджера могут отвязать
 * от офиса, пока стойка открыта, — прочитанный раньше список соврал бы в обоих случаях.
 *
 * Отказ сначала отдаётся странице через `reportDenial` — как у стойки (`useOfficeDesk`).
 * Не взяла — список «не прочитался», и экран предлагает повторить.
 */
export const useDeskOffices = (
  readHeaders: () => Record<string, string>,
  reportDenial: (error: unknown) => boolean = () => false,
) => {
  const state = ref<LoadState>('loading');
  const offices = ref<DeskOffice[]>([]);

  /** Номер запроса: ответ устаревшего не перетирает свежий, если показ повторили быстро. */
  let request = 0;

  const load = async (): Promise<void> => {
    const current = ++request;

    state.value = 'loading';

    try {
      const response = await $fetch<DeskOfficesResponse>('/api/desk/offices', { headers: readHeaders() });

      if (current !== request) {
        return;
      }

      offices.value = response.offices;
      state.value = 'ready';
    } catch (error) {
      if (current !== request || reportDenial(error)) {
        return;
      }

      console.error('[desk] не удалось загрузить офисы', error);
      state.value = 'error';
    }
  };

  return { state, offices, load };
};
