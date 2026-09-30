import { onMounted, ref } from 'vue';
import { failureText } from '~/utils/requestError';
import type { LoadState } from '~/types/loadState';
import { reportPath, type ReportKey } from '#shared/reports';
import type { ReportOffice, ReportOptionsResponse, ReportResult } from '#shared/types/reports';

/**
 * Раздел «Отчёты» (issue #308): выбор офиса, показ отчёта и ссылка на его выгрузку.
 *
 * Запросы живут здесь, а не в компонентах (docs/frontend.md → «Данные в компоненты не ходят»).
 * Ручки у всех отчётов одного вида — `/api/reports/{отчёт}` и `…/export` с теми же
 * параметрами, — поэтому новый отчёт сюда строк не добавляет.
 */

/** Параметры запроса отчёта, как их шлёт экран: пустые поля не отправляются. */
export type ReportQuery = Record<string, string>;

export const useReports = () => {
  const offices = ref<ReportOffice[]>([]);
  const officesError = ref<string | null>(null);

  /** `null` — отчёт ещё не показывали: на экране ни таблицы, ни состояния. */
  const state = ref<LoadState | null>(null);
  const result = ref<ReportResult | null>(null);
  const error = ref<string | null>(null);

  /**
   * Ссылка выгрузки показанного отчёта. Ставится только по удачному показу: кнопка скачивает
   * то, что на экране, а не то, что набрано в фильтрах после.
   */
  const exportUrl = ref<string | null>(null);

  /**
   * Номер последнего запроса. «Показать», нажатое дважды с разными датами, может получить
   * ответы не по порядку, и первый приехавший последним подписал бы под фильтрами чужой отчёт.
   */
  let sequence = 0;

  const loadOffices = async (): Promise<void> => {
    try {
      const response = await $fetch<ReportOptionsResponse>('/api/reports/options');

      offices.value = response.offices;
      officesError.value = null;
    } catch (failure) {
      officesError.value = failureText(failure);
    }
  };

  const show = async (report: ReportKey, query: ReportQuery): Promise<void> => {
    const current = ++sequence;

    state.value = 'loading';
    error.value = null;

    try {
      const response = await $fetch<ReportResult>(`/api/reports/${reportPath(report)}`, { query });

      if (current !== sequence) {
        return;
      }

      result.value = response;
      state.value = 'ready';
      exportUrl.value = `/api/reports/${reportPath(report)}/export?${new URLSearchParams(query).toString()}`;
    } catch (failure) {
      if (current !== sequence) {
        return;
      }

      result.value = null;
      state.value = 'error';
      error.value = failureText(failure);
      exportUrl.value = null;
    }
  };

  onMounted(loadOffices);

  return { offices, officesError, state, result, error, exportUrl, show };
};
