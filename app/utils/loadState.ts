import type { LoadState } from '~/types/loadState';

/** Как `useFetch` называет своё состояние. */
type FetchStatus = 'idle' | 'pending' | 'success' | 'error';

/**
 * Приводит состояние запроса к трём состояниям экрана.
 *
 * `idle` попадает в загрузку, а не в готовность: запрос, ещё не начавшийся, данных
 * не имеет, и показать по нему пустоту значило бы соврать.
 */
export const toLoadState = (status: FetchStatus): LoadState => {
  if (status === 'error') {
    return 'error';
  }

  return status === 'success' ? 'ready' : 'loading';
};
