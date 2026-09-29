/**
 * Параметры синхронизации — заказов и профилей парка.
 *
 * Все значения читаются из окружения и имеют умолчание: прогон обязан быть запускаемым
 * на чистом `.env.example`, а не только у того, кто помнит список переменных.
 */

/** Виды прогона, опрашивающие заказы. */
export type OrdersSyncKind = 'orders' | 'orders_catchup';

/**
 * Виды прогона, опрашивающие профили парка.
 *
 * `registry` — инкрементальный по `updated_at`, рабочий режим, ходит по расписанию.
 * `registry_full` — полный обход нарезкой, запускается командой: первое наполнение,
 * подозрение на расхождение, аудит (docs/decisions.md → «Полный обход реестра — режим
 * синхронизации, а не разовый скрипт»).
 */
export type RegistrySyncKind = 'registry' | 'registry_full';

/** Виды прогона, у которых бывает расписание. Полный обход в этот список не входит намеренно. */
export type ScheduledSyncKind = OrdersSyncKind | 'registry';

export type SyncConfig = {
  /** Выключатель повторяющейся задачи. Разовый прогон командой работает и при `false`. */
  liveEnabled: boolean;
  /** Как часто повторяется скользящий прогон. */
  liveIntervalSec: number;
  /**
   * Догоняющий прогон: широкая полоса проходами, свой выключатель и свой интервал.
   *
   * Интервал — как часто пробовать, а не как часто перечитывать неделю: запуск продолжает
   * идущий проход с позиции, а новый проход начинается не чаще `catchupPassEveryHours`.
   * Недели одним прогоном лимит ключа не отпускает — проход поэтому режется на куски
   * по `catchupSliceHours`, и каждый пройденный кусок двигает позицию.
   */
  catchupEnabled: boolean;
  catchupIntervalSec: number;
  /** Ширина прохода назад от его конца. */
  catchupDays: number;
  /** Ширина куска прохода. Последний кусок короче. */
  catchupSliceHours: number;
  /** Не раньше чем через столько часов после конца пройденного прохода начинается новый. */
  catchupPassEveryHours: number;
  /**
   * Синхронизация профилей парка: выключатель и интервал повторяющейся задачи.
   *
   * Интервал выбирается из потребности, а не из экономии. Это единицы запросов в сутки
   * против 4 062 в час у старого бота: инкрементальный прогон берёт не весь реестр,
   * а изменившихся по фильтру `updated_at` (docs/decisions.md → «Реестр парка отделён
   * от участия в программе»).
   */
  registryEnabled: boolean;
  registryIntervalSec: number;
  /** Перекрытие окна профилей назад от отметки. Повтор отсекается записью по `profile_id`. */
  registryOverlapMinutes: number;
  /** Отставание верхней границы окна профилей от текущего момента. */
  registryLagSeconds: number;
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
   * Значение выбрано по самому долгому законному прогону, каким он был до нарезки догона
   * на куски: неделя одним прогоном — порядка полусотни страниц, с бэкоффом на отказах
   * около часа. Кусок прохода много короче, и три часа берут его с большим запасом,
   * при этом не давая строке висеть сутками.
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
    catchupIntervalSec: readInteger('SYNC_CATCHUP_INTERVAL_SEC', 900),
    catchupDays: readInteger('SYNC_CATCHUP_DAYS', 7),
    catchupSliceHours: readInteger('SYNC_CATCHUP_SLICE_HOURS', 4),
    catchupPassEveryHours: readInteger('SYNC_CATCHUP_PASS_EVERY_HOURS', 24),
    registryEnabled: readFlag('SYNC_REGISTRY_ENABLED', false),
    registryIntervalSec: readInteger('SYNC_REGISTRY_INTERVAL_SEC', 3_600),
    registryOverlapMinutes: readInteger('SYNC_REGISTRY_OVERLAP_MIN', 60),
    registryLagSeconds: readInteger('SYNC_REGISTRY_LAG_SEC', 60),
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

  // Та же дыра, что у заказов, входящая со стороны профилей: профиль, изменившийся позже,
  // чем через `lag` после нашего запроса, не попадёт ни в это окно, ни в следующее.
  if (config.registryLagSeconds >= config.registryOverlapMinutes * 60) {
    throw new Error(
      `SYNC_REGISTRY_LAG_SEC (${config.registryLagSeconds} c) должен быть меньше SYNC_REGISTRY_OVERLAP_MIN (${config.registryOverlapMinutes} мин): иначе окна не перекрываются и между ними остаётся дыра`,
    );
  }

  if (config.liveMaxWindowMinutes <= config.overlapMinutes) {
    throw new Error(
      `SYNC_LIVE_MAX_WINDOW_MIN (${config.liveMaxWindowMinutes}) должен быть больше SYNC_LIVE_OVERLAP_MIN (${config.overlapMinutes}): иначе окно не сдвигается вперёд и прогон топчется на месте`,
    );
  }

  // Каждый кусок, кроме первого, начинается на перекрытие раньше конца предыдущего. Кусок
  // не шире перекрытия целиком лежал бы внутри уже пройденного и перечитывал бы его заново.
  if (config.catchupSliceHours * 60 <= config.overlapMinutes) {
    throw new Error(
      `SYNC_CATCHUP_SLICE_HOURS (${config.catchupSliceHours} ч) должен быть больше SYNC_LIVE_OVERLAP_MIN (${config.overlapMinutes} мин): иначе кусок прохода целиком лежит в перекрытии с предыдущим`,
    );
  }

  return config;
};

/** Сколько миллисекунд между запусками у этого вида прогона. */
export const syncIntervalMs = (kind: ScheduledSyncKind, config: SyncConfig): number => {
  if (kind === 'orders_catchup') {
    return config.catchupIntervalSec * 1_000;
  }

  if (kind === 'registry') {
    return config.registryIntervalSec * 1_000;
  }

  return config.liveIntervalSec * 1_000;
};

/** Столько интервалов подряд отметка может не двигаться, прежде чем это станет тревогой. */
const STALE_WATERMARK_INTERVALS = 3;

/**
 * После какого отставания отметки прогон обязан пожаловаться в лог.
 *
 * Порог считается от интервала этого вида прогона, а не константой: у каждого вида свой
 * интервал, и мерить реестр тем же числом, что минутный скользящий, бессмысленно.
 *
 * У догоняющего порог мерит не отставание отметки, а то, как долго не двигается позиция
 * идущего прохода: сама позиция стоит на неделю в прошлом штатно. Пройденный проход,
 * ждущий следующего, тревогой не бывает вовсе — это решает `readSyncWatermarks`.
 *
 * Зачем это вообще: если падать начнёт каждый скользящий прогон — например, лимит ключа
 * перестанет отпускать вовсе, — отметка не сдвинется никогда. Прогоны при этом идут минута
 * за минутой, строки в `sync_runs` появляются, воркер жив и логи пишутся, а баллы
 * не начисляются. Это ровно то состояние, в котором годами жил старый бот: система
 * выглядит работающей.
 */
export const staleWatermarkThresholdMs = (kind: ScheduledSyncKind, config: SyncConfig): number =>
  Math.max(syncIntervalMs(kind, config) * STALE_WATERMARK_INTERVALS, config.staleFloorMinutes * 60_000);
