import { computed, onMounted, ref, watch } from 'vue';
import { failureText } from '~/utils/requestError';
import type { LoadState } from '~/types/loadState';
import type { MailingSurveyResults, MailingSurveyResultsResponse } from '#shared/types/surveyResults';

/**
 * Итоги опроса у рассылки (issue #325): таблица по выбранному срезу и ссылка на выгрузку
 * с тем же срезом.
 *
 * Срез — одно значение выбора: пусто — без среза, `activity` — по активности, иначе
 * идентификатор сегмента. Запросы живут здесь, а не в компонентах (docs/frontend.md →
 * «Данные в компоненты не ходят»).
 */

/** Значение выбора «по активности». Идентификатор сегмента с ним не совпадает: тот — uuid. */
export const ACTIVITY_SLICE = 'activity';

export const useMailingSurveyResults = (readMailingId: () => string | null) => {
  const slice = ref('');
  const completedOnly = ref(false);

  const state = ref<LoadState>('loading');
  const results = ref<MailingSurveyResults | null>(null);
  const error = ref<string | null>(null);

  const sliceQuery = computed((): Record<string, string> => {
    if (slice.value === '') {
      return {};
    }

    if (slice.value === ACTIVITY_SLICE) {
      return { slice: ACTIVITY_SLICE };
    }

    return { slice: 'segment', segmentId: slice.value };
  });

  /** Выгрузка — с тем же срезом, что таблица. «Только прошедшие» файл не сужает. */
  const exportUrl = computed(() => {
    const mailingId = readMailingId();

    if (mailingId === null) {
      return null;
    }

    const query = new URLSearchParams(sliceQuery.value).toString();

    return `/api/mailings/${mailingId}/survey-results/export${query ? `?${query}` : ''}`;
  });

  /**
   * Номер последнего запроса: ответ по прежнему срезу, пришедший позже, отбрасывается —
   * иначе под выбранным срезом стояли бы чужие числа.
   */
  let sequence = 0;

  const load = async (): Promise<void> => {
    const mailingId = readMailingId();

    if (mailingId === null) {
      return;
    }

    const current = ++sequence;
    state.value = 'loading';
    error.value = null;

    try {
      const response = await $fetch<MailingSurveyResultsResponse>(
        `/api/mailings/${mailingId}/survey-results`,
        { query: { ...sliceQuery.value, ...(completedOnly.value ? { completedOnly: '1' } : {}) } },
      );

      if (current === sequence) {
        results.value = response.results;
        state.value = 'ready';
      }
    } catch (failure) {
      if (current === sequence) {
        error.value = failureText(failure);
        state.value = 'error';
      }
    }
  };

  // Только в браузере: ручка за входом, а запрос с сервера страницы ушёл бы без cookie.
  onMounted(() => {
    watch([readMailingId, slice, completedOnly], () => void load(), { immediate: true });
  });

  return { slice, completedOnly, state, results, error, exportUrl, reload: load };
};
