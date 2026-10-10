import { isMetrikaExcludedPath, METRIKA_ID_GLOBAL } from '#shared/metrika';

/**
 * Счётчик Яндекс Метрики (issue #432): заведение, просмотры и связь визита с водителем.
 *
 * Загрузчик и номер счётчика ставит в страницу сервер (`server/plugins/metrika.ts`); номера
 * нет или `tag.js` не загрузился — каждый вызов молча ничего не делает. Метрика — наблюдение
 * со стороны, и страница, упавшая из-за неё, — худший из возможных исходов.
 *
 * Адреса уходят без query-строки и хеша — и адрес просмотра, и источник: параметр, однажды
 * добавленный в адрес, не уедет в Метрику незаметно. Этим закрыты только наши просмотры —
 * адрес страницы Метрика читает и сама, поэтому личного в адресе не держим вовсе: запрос
 * поиска водителя живёт в `history.state` (`app/pages/drivers/index.vue`).
 */

type YandexMetrikaCall = (counterId: number, method: string, ...args: unknown[]) => void;

declare global {
  interface Window {
    /** Очередь вызовов Метрики — её заводит загрузчик в `<head>`. */
    ym?: YandexMetrikaCall;
    /** Номер счётчика из окружения сервера. Нет — счётчика на странице нет. */
    [METRIKA_ID_GLOBAL]?: number;
  }
}

/**
 * Параметры счётчика. Просмотры шлёт код сам (`defer`): Mini App — одна страница `/app`,
 * экраны меняются состоянием, и без виртуальных адресов весь визит был бы одним просмотром.
 */
const INIT_OPTIONS = {
  defer: true,
  webvisor: true,
  clickmap: true,
  trackLinks: true,
  accurateTrackBounce: true,
} as const;

/** Счётчик заведён в этой загрузке страницы. До того просмотрам идти некуда. */
let initialized = false;

const counter = (): { id: number; ym: YandexMetrikaCall } | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const id = window[METRIKA_ID_GLOBAL];
  const ym = window.ym;

  return typeof id === 'number' && typeof ym === 'function' ? { id, ym } : null;
};

/** Вызов Метрики, который не роняет страницу, что бы ни случилось внутри чужого кода. */
const call = (method: string, ...args: unknown[]): void => {
  const current = counter();

  if (!current) {
    return;
  }

  try {
    current.ym(current.id, method, ...args);
  } catch {
    // Сбой счётчика — не сбой страницы.
  }
};

/** Адрес нашего сайта или чужой целиком, но без query-строки и хеша. `null` — не разобрался. */
const withoutQuery = (address: string): URL | null => {
  try {
    const url = new URL(address, window.location.origin);

    url.search = '';
    url.hash = '';

    return url;
  } catch {
    return null;
  }
};

/** Источник просмотра — пустая строка, если его нет или это страница с токеном в адресе. */
const refererFor = (address: string): string => {
  const url = address === '' ? null : withoutQuery(address);

  if (!url || (url.origin === window.location.origin && isMetrikaExcludedPath(url.pathname))) {
    return '';
  }

  return url.href;
};

export const useMetrika = () => {
  /**
   * Заводит счётчик. Веб — при старте приложения, Mini App — когда подписанная строка
   * прочитана и стёрта из адреса: `init` читает адрес страницы, а в хеше лежал пропуск
   * водителя.
   */
  const init = (): void => {
    if (initialized || !counter()) {
      return;
    }

    call('init', INIT_OPTIONS);
    initialized = true;
  };

  /**
   * Просмотр адреса `path`; `referer` — откуда пришли: путь своего сайта или чужой адрес
   * целиком. Источник передаётся всегда, хотя бы пустым: без него Метрика взяла бы
   * `document.referrer` как есть — с query-строкой.
   */
  const hit = (path: string, referer: string): void => {
    const url = withoutQuery(path);

    if (!initialized || !url || isMetrikaExcludedPath(url.pathname)) {
      return;
    }

    call('hit', url.href, { referer: refererFor(referer) });
  };

  /** Визит водителя связывается с его `personId` — тем же, что в адресе карточки в вебе. */
  const setPersonId = (personId: string): void => {
    if (!initialized) {
      return;
    }

    call('userParams', { personId });
  };

  /**
   * Цель Метрики — `reachGoal` (issue #456): экран заявки показан, заявка принята. Без счётчика
   * молча ничего не делает, как остальные вызовы.
   */
  const goal = (name: string, params?: Record<string, string>): void => {
    if (!initialized) {
      return;
    }

    call('reachGoal', name, params);
  };

  return { init, hit, setPersonId, goal };
};
