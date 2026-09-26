import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { failureText } from '~/utils/requestError';
import type { LoadState } from '~/types/loadState';
import { isSegmentBounded } from '#shared/segment';
import type {
  SegmentConditions,
  SegmentPreviewRequestBody,
  SegmentPreviewResponse,
} from '#shared/types/segment';

/**
 * Предпросмотр состава сегмента: число и страница строк по тому, что сейчас в форме.
 *
 * Считает по мере правки, без сохранения: границы «20–90» крутят и смотрят, как меняется
 * число (issue #165). Пока условия формы совпадают с сохранёнными, зовётся ручка сохранённого
 * сегмента, иначе — предпросмотр несохранённого: экран подписывает, по какому из двух посчитано.
 *
 * Запросы живут здесь, а не в компонентах (docs/frontend.md → «Данные в компоненты не ходят»).
 */

/** Пауза после правки поля: число набирают по цифре, и считать каждую незачем. */
const PREVIEW_DELAY_MS = 400;

export type SegmentPreviewSource = {
  conditions: SegmentConditions;
  /** Сегмент демо: отбирает только демо-водителей (issue #212). */
  isDemo: boolean;
  /** Сохранённый сегмент, если условия формы совпадают с его. `null` — считать по форме. */
  savedSegmentId: string | null;
};

export const useSegmentPreview = (readSource: () => SegmentPreviewSource) => {
  const state = ref<LoadState>('loading');
  const data = ref<SegmentPreviewResponse | null>(null);
  const error = ref<string | null>(null);
  const offset = ref(0);

  /**
   * Пересчёт поверх показанного. Отдельно от `state`: при правке границы прежнее число стоит
   * на экране, пока не приехало новое, — иначе блок моргал бы на каждой цифре.
   */
  const refreshing = ref(false);

  /**
   * Условий нет — считать нечего, и экран говорит об этом словами, а не пустотой. У демо-сегмента
   * считать есть что всегда: без условий это все демо-водители (issue #212).
   */
  const hasConditions = ref(isSegmentBounded(readSource().conditions, readSource().isDemo));

  /**
   * Номер последнего запроса. Ответы приходят не по порядку: число по «20–9» может приехать
   * позже числа по «20–90», и показать его значило бы подписать под формой чужое число.
   */
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fetchPreview = (source: SegmentPreviewSource): Promise<SegmentPreviewResponse> => {
    if (source.savedSegmentId !== null) {
      return $fetch<SegmentPreviewResponse>(`/api/segments/${source.savedSegmentId}/preview`, {
        query: { offset: offset.value },
      });
    }

    const body: SegmentPreviewRequestBody = {
      conditions: source.conditions,
      isDemo: source.isDemo,
      offset: offset.value,
    };

    return $fetch<SegmentPreviewResponse>('/api/segments/preview', { method: 'POST', body });
  };

  const load = async (): Promise<void> => {
    const source = readSource();
    const current = ++sequence;

    hasConditions.value = isSegmentBounded(source.conditions, source.isDemo);

    if (!hasConditions.value) {
      data.value = null;
      error.value = null;
      state.value = 'ready';
      refreshing.value = false;

      return;
    }

    refreshing.value = true;

    try {
      const response = await fetchPreview(source);

      if (current !== sequence) {
        return;
      }

      data.value = response;
      error.value = null;
      state.value = 'ready';
    } catch (failure) {
      if (current !== sequence) {
        return;
      }

      error.value = failureText(failure);
      state.value = 'error';
    } finally {
      if (current === sequence) {
        refreshing.value = false;
      }
    }
  };

  const schedule = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      void load();
    }, PREVIEW_DELAY_MS);
  };

  // Новые условия — с первой страницы: смещение от прежнего состава показало бы пустоту там,
  // где строки есть.
  watch(
    () => readSource(),
    () => {
      offset.value = 0;
      schedule();
    },
    { deep: true },
  );

  const page = (nextOffset: number): void => {
    offset.value = nextOffset;
    void load();
  };

  /** Пересчёт сразу, без паузы: после сохранения источник меняется, а ждать правки незачем. */
  const reload = (): Promise<void> => load();

  // Только в браузере: число на сейчас, посчитанное при серверной отрисовке, приехало бы
  // в кадр уже прошлым.
  onMounted(() => {
    void load();
  });

  onBeforeUnmount(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });

  return { state, data, error, refreshing, hasConditions, page, reload };
};
