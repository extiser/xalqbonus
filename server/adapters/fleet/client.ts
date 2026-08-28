/**
 * Транспорт к Yandex Fleet API.
 *
 * Адаптер внешней системы: знает про сеть и формат ответа и **не знает про базу**
 * (docs/principles.md → «Слои и зависимости»).
 *
 * Правила обхода перенесены из отлаженного разведочного скрипта `scripts/fleet_client.py` —
 * перенесена логика, а не файл: скрипт остаётся жить своей жизнью на питоне.
 *
 *   - запросы строго последовательные, никакого параллелизма;
 *   - между запросами выдерживается пауза, на отказе по лимиту она удваивается
 *     и **не отыгрывается назад до конца прогона**: квота Fleet API скользящая,
 *     и разгон обратно упирается в ту же границу на следующей странице;
 *   - отказ по лимиту повторяет тот же запрос с экспоненциальным отступлением
 *     и джиттером; попыток на запрос ограниченное число;
 *   - когда попытки исчерпаны — исключение, а не тихий пропуск страницы: прогон
 *     с дырой хуже, чем упавший прогон, потому что дыру никто не заметит.
 *
 * Порог лимита нигде не опубликован, `Retry-After` и `X-RateLimit-*` Яндекс не присылает —
 * обрабатывать приходится вслепую, по коду ответа (docs/yandex-fleet.md).
 *
 * Ключ, идентификатор клиента и тело запроса не логируются нигде и ни на каком уровне.
 */

/** Ниже этого пауза между запросами не опускается. Значение проверено разведкой. */
const MIN_PAUSE_MS = 1_500;

/** Выше этого пауза между запросами не растёт. */
const MAX_PAUSE_MS = 45_000;

/** Попыток на один запрос, включая первую. */
const MAX_ATTEMPTS = 5;

/** Пауза перед первым повтором, дальше удваивается. */
const FIRST_BACKOFF_MS = 5_000;

/** Выше этого пауза повтора не растёт. */
const MAX_BACKOFF_MS = 120_000;

/** Доля случайной добавки к паузе повтора: два воркера не должны отступать в такт. */
const BACKOFF_JITTER = 0.25;

const REQUEST_TIMEOUT_MS = 120_000;

const TOO_MANY_REQUESTS = 429;

export type FleetCredentials = {
  baseUrl: string;
  clientId: string;
  apiKey: string;
  parkId: string;
};

/** Счётчики обхода. Уезжают в строку `xb.sync_runs` — прогон обязан показывать свою цену. */
export type FleetRequestStats = {
  requests: number;
  rateLimited: number;
  waitedMs: number;
};

/**
 * Ответ Fleet API, на который повторять запрос бессмысленно: неверные ключи, недостаток
 * прав, кривой запрос. Текст ответа в сообщение не подставляется целиком — тело ошибки
 * может содержать эхо запроса.
 */
export class FleetApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly description: string,
    public readonly code: string | null,
  ) {
    super(`Fleet API ответил ${status} на «${description}»${code ? ` (${code})` : ''}`);
    this.name = 'FleetApiError';
  }
}

/**
 * Попытки на запрос кончились, а лимит не отпустил.
 *
 * Отдельным типом, а не общей ошибкой: прогон, упавший по этой причине, — это не поломка
 * кода, а исчерпанная квота ключа. Отметка синхронизации при этом не двигается, и окно
 * будет перечитано целиком следующим прогоном.
 */
export class FleetRateLimitError extends Error {
  constructor(
    public readonly description: string,
    public readonly attempts: number,
  ) {
    super(`лимит Fleet API не отпустил «${description}» за ${attempts} попыток`);
    this.name = 'FleetRateLimitError';
  }
}

const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`в окружении не заполнен ${name}`);
  }

  return value;
};

export const readFleetCredentials = (): FleetCredentials => ({
  baseUrl: requireEnv('YANDEX_BASE_URL').replace(/\/+$/, ''),
  clientId: requireEnv('YANDEX_CLIENT_ID'),
  apiKey: requireEnv('YANDEX_API_KEY'),
  parkId: requireEnv('YANDEX_PARK_ID'),
});

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const withJitter = (milliseconds: number): number =>
  Math.round(milliseconds * (1 + Math.random() * BACKOFF_JITTER));

const readErrorCode = (payload: unknown): string | null => {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const code = (payload as Record<string, unknown>)['code'];

  return typeof code === 'string' ? code : null;
};

/**
 * Всё, что методы выборки требуют от транспорта: парк, запрос и счётчики.
 *
 * Отдельным типом, чтобы прогон синхронизации можно было проверить тестом, не выходя
 * в сеть. Класс `FleetClient` отвечает ему структурно, второй реализации в рабочем коде
 * нет и не предполагается.
 */
export type FleetTransport = {
  readonly parkId: string;
  post<Payload>(path: string, body: unknown, description: string): Promise<Payload>;
  stats(): FleetRequestStats;
};

/** Что случилось с одной сетевой попыткой. Тело ответа наверх поднимается только у 200. */
type Attempt =
  | { kind: 'ok'; payload: unknown }
  | { kind: 'rateLimited' }
  | { kind: 'retryable'; reason: string }
  | { kind: 'fatal'; status: number; code: string | null };

export type FleetClientOptions = {
  /** Куда сообщать об отказах по лимиту. Ключ и тело запроса сюда не попадают никогда. */
  onRateLimited?: (description: string, attempt: number, waitMs: number) => void;
  /**
   * Чем выдерживается пауза. Подменяется тестом: проверять отступление, честно засыпая
   * на минуту, — это не проверка, а ожидание.
   */
  sleep?: (milliseconds: number) => Promise<void>;
};

const describeFailure = (error: unknown): string =>
  error instanceof Error ? error.message : 'неизвестный отказ';

export class FleetClient {
  private requests = 0;
  private rateLimited = 0;
  private waitedMs = 0;
  private lastRequestAt = 0;
  private pauseMs = MIN_PAUSE_MS;

  constructor(
    private readonly credentials: FleetCredentials,
    private readonly options: FleetClientOptions = {},
  ) {}

  get parkId(): string {
    return this.credentials.parkId;
  }

  stats(): FleetRequestStats {
    return { requests: this.requests, rateLimited: this.rateLimited, waitedMs: this.waitedMs };
  }

  /** Список: тело запроса уходит в JSON, как во всех методах выборки Fleet API. */
  async post<Payload>(path: string, body: unknown, description: string): Promise<Payload> {
    let backoffMs = FIRST_BACKOFF_MS;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await this.respectPause();

      const result = await this.singleRequest(path, body);
      this.lastRequestAt = Date.now();

      if (result.kind === 'ok') {
        return result.payload as Payload;
      }

      if (result.kind === 'fatal') {
        throw new FleetApiError(result.status, description, result.code);
      }

      if (result.kind === 'rateLimited') {
        this.rateLimited += 1;
        this.slowDown();
      }

      if (attempt === MAX_ATTEMPTS) {
        if (result.kind === 'rateLimited') {
          throw new FleetRateLimitError(description, MAX_ATTEMPTS);
        }

        throw new Error(`запрос «${description}» не прошёл за ${MAX_ATTEMPTS} попыток: ${result.reason}`);
      }

      const waitMs = withJitter(backoffMs);

      if (result.kind === 'rateLimited') {
        this.options.onRateLimited?.(description, attempt, waitMs);
      }

      await this.wait(waitMs);
      this.waitedMs += waitMs;
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }

    // Недостижимо: цикл выходит либо ответом, либо исключением на последней попытке.
    throw new Error(`запрос «${description}» вышел из цикла попыток без результата`);
  }

  /**
   * Отказ по лимиту означает, что выбранный темп для этого ключа слишком быстрый.
   * Сбавляем на весь остаток прогона: назад пауза не отыгрывается, иначе следующая
   * страница снова упрётся в ту же границу.
   */
  private slowDown(): void {
    this.pauseMs = Math.min(Math.max(this.pauseMs * 2, FIRST_BACKOFF_MS), MAX_PAUSE_MS);
  }

  private async respectPause(): Promise<void> {
    if (this.lastRequestAt === 0) {
      return;
    }

    const remaining = this.pauseMs - (Date.now() - this.lastRequestAt);

    if (remaining > 0) {
      await this.wait(remaining);
    }
  }

  private wait(milliseconds: number): Promise<void> {
    return (this.options.sleep ?? sleep)(milliseconds);
  }

  /**
   * Один сетевой вызов вместе с разбором тела.
   *
   * Разбор тела живёт здесь же, под тем же `try`, а не снаружи: прокси, отдавший HTML
   * с кодом 200, — это заминка на пути к API, и лечится она тем же повтором, что обрыв
   * связи. Разбор снаружи давал бы необработанное исключение посреди прогона.
   */
  private async singleRequest(path: string, body: unknown): Promise<Attempt> {
    this.requests += 1;

    try {
      const response = await fetch(this.credentials.baseUrl + path, {
        method: 'POST',
        headers: {
          'X-Client-ID': this.credentials.clientId,
          'X-API-Key': this.credentials.apiKey,
          'Accept-Language': 'ru',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === TOO_MANY_REQUESTS) {
        // Тело отказа по лимиту не читается: в нём строка `Limit exceeded.` и эхо запроса.
        await response.body?.cancel();
        return { kind: 'rateLimited' };
      }

      if (response.ok) {
        try {
          return { kind: 'ok', payload: await response.json() };
        } catch (error) {
          return {
            kind: 'retryable',
            reason: `ответ 200 не разбирается как JSON: ${describeFailure(error)}`,
          };
        }
      }

      // Пятисотка на той стороне — это заминка, а не наш неверный запрос.
      if (response.status >= 500) {
        return { kind: 'retryable', reason: `HTTP ${response.status}` };
      }

      const payload: unknown = await response.json().catch(() => null);

      return { kind: 'fatal', status: response.status, code: readErrorCode(payload) };
    } catch (error) {
      // Сеть, таймаут, TLS. Повторяется тем же отступлением, что и отказ по лимиту:
      // разбирать причину незачем, лечение одно.
      return { kind: 'retryable', reason: describeFailure(error) };
    }
  }
}

export const createFleetClient = (options: FleetClientOptions = {}): FleetClient =>
  new FleetClient(readFleetCredentials(), options);
