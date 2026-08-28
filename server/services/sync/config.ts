/**
 * Параметры синхронизации заказов.
 *
 * Все значения читаются из окружения и имеют умолчание: прогон обязан быть запускаемым
 * на чистом `.env.example`, а не только у того, кто помнит список переменных.
 */

/** Виды прогона, опрашивающие заказы. `registry` сюда не относится. */
export type OrdersSyncKind = 'orders' | 'orders_catchup';

export type SyncConfig = {
  /** Выключатель повторяющейся задачи. Разовый прогон командой работает и при `false`. */
  liveEnabled: boolean;
  /** Как часто повторяется скользящий прогон. */
  liveIntervalSec: number;
  /** Догоняющий прогон: раз в сутки, широкое окно. Свой выключатель и свой интервал. */
  catchupEnabled: boolean;
  catchupIntervalSec: number;
  catchupDays: number;
  /** Перекрытие окна назад от отметки. Безопасно: повтор отсекается ключами. */
  overlapMinutes: number;
  /**
   * Отставание верхней границы окна от текущего момента.
   *
   * Только что завершившийся заказ появляется в выборке по `ended_at` не мгновенно,
   * а отметка синхронизации двигается по верхней границе окна. Всё, что доехало до API
   * после того, как граница его прошла, ловится перекрытием — поэтому отставание держится
   * заведомо меньшим, чем перекрытие, и служит не защитой, а тем, чтобы граница окна
   * не стояла на самом горячем крае выборки.
   */
  lagSeconds: number;
  /** Размер страницы курсорной пагинации. Максимум, разрешённый методом, — 500. */
  pageLimit: number;
  /**
   * Потолок ширины скользящего окна за один прогон.
   *
   * Воркер, простоявший неделю, иначе построил бы окно в неделю шириной: полсотни страниц
   * в один прогон, отказы по лимиту и упавший прогон, который не двигает отметку и потому
   * повторяется вечно. Верхняя граница режется потолком, отметка встаёт на неё, и остаток
   * догоняется следующими прогонами — без единого пропущенного заказа.
   */
  liveMaxWindowMinutes: number;
  /**
   * Сколько прогон может законно идти, прежде чем считаться оборванным.
   *
   * Строку `running` закрывает сам прогон — успехом или отказом, — но `SIGKILL`
   * (`docker stop` по таймауту, OOM) не оставляет ему такой возможности, и строка остаётся
   * бежать вечно. Данные при этом не теряются: отметка не сдвинута, окно перечитается.
   * Теряется журнал прогонов, а это фундамент будущего экрана наблюдаемости.
   *
   * Значение выбрано по самому долгому законному прогону: догоняющий за неделю — это
   * порядка полусотни страниц, и с бэкоффом на отказах он идёт около часа. Три часа берут
   * это с запасом и при этом не дают строке висеть сутками.
   */
  abandonedRunMinutes: number;
  /**
   * Нижняя граница порога отставания отметки.
   *
   * Порог считается от интервала прогона, но у минутного скользящего три интервала —
   * это три минуты, и жалоба на трёхминутное отставание была бы шумом. Значение назначается
   * по суточному замеру живой синхронизации: пока замера нет, любое новое число было бы
   * выдумкой, и умолчание остаётся тем, с которым детектор написан.
   */
  staleFloorMinutes: number;
};

const readInteger = (name: string, fallback: number): number => {
  const raw = process.env[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} должен быть целым положительным числом, получено «${raw}»`);
  }

  return value;
};

// Строка сравнивается с `true`, а не проверяется на непустоту: `SYNC_LIVE_ENABLED=false`
// иначе включал бы синхронизацию.
const readFlag = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  return raw.trim().toLowerCase() === 'true';
};

/** Больше этого метод заказов не принимает. */
const MAX_PAGE_LIMIT = 500;

export const readSyncConfig = (): SyncConfig => {
  const pageLimit = readInteger('SYNC_PAGE_LIMIT', 500);

  if (pageLimit > MAX_PAGE_LIMIT) {
    throw new Error(`SYNC_PAGE_LIMIT не может быть больше ${MAX_PAGE_LIMIT}`);
  }

  const config: SyncConfig = {
    liveEnabled: readFlag('SYNC_LIVE_ENABLED', false),
    liveIntervalSec: readInteger('SYNC_LIVE_INTERVAL_SEC', 60),
    catchupEnabled: readFlag('SYNC_CATCHUP_ENABLED', false),
    catchupIntervalSec: readInteger('SYNC_CATCHUP_INTERVAL_SEC', 86_400),
    catchupDays: readInteger('SYNC_CATCHUP_DAYS', 7),
    overlapMinutes: readInteger('SYNC_LIVE_OVERLAP_MIN', 10),
    lagSeconds: readInteger('SYNC_LIVE_LAG_SEC', 60),
    pageLimit,
    liveMaxWindowMinutes: readInteger('SYNC_LIVE_MAX_WINDOW_MIN', 360),
    abandonedRunMinutes: readInteger('SYNC_ABANDONED_RUN_MIN', 180),
    staleFloorMinutes: readInteger('SYNC_STALE_FLOOR_MIN', 15),
  };

  // Перекрытие меньше отставания означает дыру: заказ, доехавший до API позже, чем через
  // `lag` после завершения, не попадёт ни в это окно, ни в следующее.
  if (config.lagSeconds >= config.overlapMinutes * 60) {
    throw new Error(
      `SYNC_LIVE_LAG_SEC (${config.lagSeconds} c) должен быть меньше SYNC_LIVE_OVERLAP_MIN (${config.overlapMinutes} мин): иначе окна не перекрываются и между ними остаётся дыра`,
    );
  }

  if (config.liveMaxWindowMinutes <= config.overlapMinutes) {
    throw new Error(
      `SYNC_LIVE_MAX_WINDOW_MIN (${config.liveMaxWindowMinutes}) должен быть больше SYNC_LIVE_OVERLAP_MIN (${config.overlapMinutes}): иначе окно не сдвигается вперёд и прогон топчется на месте`,
    );
  }

  return config;
};

/** Сколько миллисекунд между запусками у этого вида прогона. */
export const syncIntervalMs = (kind: OrdersSyncKind, config: SyncConfig): number =>
  kind === 'orders_catchup' ? config.catchupIntervalSec * 1_000 : config.liveIntervalSec * 1_000;

/** Столько интервалов подряд отметка может не двигаться, прежде чем это станет тревогой. */
const STALE_WATERMARK_INTERVALS = 3;

/**
 * После какого отставания отметки прогон обязан пожаловаться в лог.
 *
 * Порог считается от интервала этого вида прогона, а не константой: у догоняющего прогона
 * интервал в сутки, и мерить его тем же числом, что минутный скользящий, бессмысленно.
 *
 * Зачем это вообще: если падать начнёт каждый скользящий прогон — например, лимит ключа
 * перестанет отпускать вовсе, — отметка не сдвинется никогда. Прогоны при этом идут минута
 * за минутой, строки в `sync_runs` появляются, воркер жив и логи пишутся, а баллы
 * не начисляются. Это ровно то состояние, в котором годами жил старый бот: система
 * выглядит работающей.
 */
export const staleWatermarkThresholdMs = (kind: OrdersSyncKind, config: SyncConfig): number =>
  Math.max(syncIntervalMs(kind, config) * STALE_WATERMARK_INTERVALS, config.staleFloorMinutes * 60_000);
