import { ref } from 'vue';
import {
  INIT_DATA_HEADER,
  type MemberOperation,
  type MiniAppHistoryResponse,
} from '#shared/types/miniapp';
import type { LoadState } from '~/types/loadState';

/**
 * История операций участника: первая страница и догрузка кнопкой.
 *
 * Запросы живут здесь, а не в компонентах: список получает готовые строки свойством
 * и отдаёт нажатие событием (docs/frontend.md → «Данные в компоненты не ходят»).
 *
 * Подписанная строка берётся не значением, а вызовом: к моменту, когда composable
 * создаётся, объекта Telegram на странице ещё нет — он подгружается скриптом, и `initData`
 * появляется позже (`app/pages/app.vue`).
 */
export const useMemberHistory = (readInitData: () => string) => {
  const state = ref<LoadState>('loading');
  const operations = ref<MemberOperation[]>([]);

  /** Метка следующей страницы. `null` — показано всё, кнопки нет. */
  const nextCursor = ref<string | null>(null);

  /** Догрузка в пути: кнопка гаснет, чтобы второе нажатие не привело ту же страницу дважды. */
  const loadingMore = ref(false);

  /**
   * Догрузка не удалась.
   *
   * Отдельно от `state`, потому что означает другое: показанные строки на месте, не приехала
   * только следующая страница. Увести весь список в отказ значило бы стереть с экрана
   * то, что водитель уже читает.
   */
  const moreFailed = ref(false);

  const fetchPage = (cursor: string | null): Promise<MiniAppHistoryResponse> =>
    $fetch<MiniAppHistoryResponse>('/api/miniapp/history', {
      headers: { [INIT_DATA_HEADER]: readInitData() },
      query: cursor === null ? {} : { cursor },
    });

  const loadFirstPage = async (): Promise<void> => {
    state.value = 'loading';

    try {
      const page = await fetchPage(null);

      operations.value = page.operations;
      nextCursor.value = page.nextCursor;
      state.value = 'ready';
    } catch (error) {
      // Текст на экране придёт с сервера, а причина обязана быть в консоли: это
      // единственное окно наружу, которое у Mini App есть (issue #90).
      console.error('[miniapp] не удалось загрузить историю операций', error);
      state.value = 'error';
    }
  };

  const loadMore = async (): Promise<void> => {
    const cursor = nextCursor.value;

    if (cursor === null || loadingMore.value) {
      return;
    }

    loadingMore.value = true;
    moreFailed.value = false;

    try {
      const page = await fetchPage(cursor);

      // Дописываем, а не заменяем: страница продолжается с метки последней показанной
      // строки, и пересечения с уже показанным у неё нет.
      operations.value = [...operations.value, ...page.operations];
      nextCursor.value = page.nextCursor;
    } catch (error) {
      console.error('[miniapp] не удалось загрузить следующую страницу истории', error);
      moreFailed.value = true;
    } finally {
      loadingMore.value = false;
    }
  };

  return { state, operations, nextCursor, loadingMore, moreFailed, loadFirstPage, loadMore };
};
