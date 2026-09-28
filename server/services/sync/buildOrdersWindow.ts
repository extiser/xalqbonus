/**
 * Построение окна опроса заказов.
 *
 * Окно строится **по времени завершения заказа и никогда по времени бронирования**.
 * Это единственная причина, по которой старый бот терял пятую часть поездок: заказ,
 * забронированный в 13:50 и завершённый в 14:20, при опросе в 14:00 попадал в выборку
 * незавершённым, а следующее окно `[14:00, 15:00]` его уже не содержало — время
 * бронирования осталось в прошлом, и заказ не запрашивался больше никогда
 * (docs/analysis.md §1.1).
 *
 * Времена — в UTC, потому что API отдаёт и фильтрует в UTC. Подстановка местного времени
 * сдвинула бы выборку на пять часов и создала ровно ту дыру, от которой мы уходим
 * (docs/yandex-fleet.md).
 */
import type { OrdersWindow } from '#server/adapters/fleet/orders';
import type { SyncConfig } from '#server/services/sync/config';

export type OrdersWindowInput = {
  /** Отметка скользящего прогона. Пусто — прогонов ещё не было. */
  watermark: Date | null;
  now: Date;
  config: SyncConfig;
};

const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const shift = (moment: Date, milliseconds: number): Date =>
  new Date(moment.getTime() + milliseconds);

/**
 * Скользящее окно: от отметки минус перекрытие до текущего момента минус отставание.
 *
 * Перекрытие безопасно — повтор отсекается уникальностью заказа и ключом идемпотентности
 * начисления, поэтому дешевле перечитать лишнее, чем однажды не перечитать нужное.
 */
const buildLiveWindow = (input: OrdersWindowInput): OrdersWindow => {
  const { config } = input;
  const upperLimit = shift(input.now, -config.lagSeconds * SECOND_MS);
  const endedFrom = shift(input.watermark ?? upperLimit, -config.overlapMinutes * MINUTE_MS);
  const cappedTo = shift(endedFrom, config.liveMaxWindowMinutes * MINUTE_MS);

  return {
    endedFrom,
    endedTo: cappedTo < upperLimit ? cappedTo : upperLimit,
  };
};

/**
 * Возвращает окно скользящего прогона или `null`, если запрашивать нечего.
 *
 * Пустое окно — не ошибка: так выглядит прогон, запущенный чаще, чем идёт время
 * (интервал меньше отставания), или сразу после предыдущего успешного. Прогон при этом
 * не заводится вовсе, и отметка остаётся на месте.
 */
export const buildOrdersWindow = (input: OrdersWindowInput): OrdersWindow | null => {
  const window = buildLiveWindow(input);

  return window.endedTo > window.endedFrom ? window : null;
};

/**
 * Догоняющий прогон: широкая полоса проходами, своя отметка, тот же код записи.
 *
 * Заказ, провисевший в промежуточном статусе несколько дней, получает время завершения
 * в прошлом. Если скользящее окно эту точку уже прошло, такой заказ не увидит никто
 * и никогда — тот же класс ошибки, что убил старого бота, зашедший с другой стороны
 * (docs/decisions.md → «Скользящего окна недостаточно»).
 *
 * Неделю одним прогоном лимит ключа не отпускает: 28-09-2026 на проде догон падал
 * на первой и на четырнадцатой странице из полусотни, а упавший прогон начинал следующий
 * с первой страницы — те же страницы, тот же отказ (issue #286). Поэтому:
 *
 *   - **проход** — полоса `[from, to]`, границы которой фиксируются при его начале
 *     и внутри прохода не сдвигаются;
 *   - проход режется на **куски** по `SYNC_CATCHUP_SLICE_HOURS`, куски идут от старых
 *     к новым, и каждый — свой прогон со своей строкой `sync_runs`;
 *   - **позиция** — отметка `orders_catchup`, конец последнего пройденного куска.
 *     Упавший кусок её не двигает и повторяется со своего начала, пройденные не читаются
 *     заново.
 */
export type CatchupPass = {
  from: Date;
  to: Date;
};

/** То, что о догоне знает `sync_state`. */
export type CatchupState = {
  /** Позиция прохода. Пусто — строки догона ещё нет. */
  watermark: Date | null;
  /** Границы прохода. Пусто — прохода нет: догон ни разу не начинал его. */
  passFrom: Date | null;
  passTo: Date | null;
};

export type CatchupPlan =
  /** Прохода нет или пройденному пора смениться: начинается новый, позиция — его начало. */
  | { action: 'start'; pass: CatchupPass }
  /** Проход идёт: куски от позиции до конца прохода. */
  | { action: 'continue'; pass: CatchupPass; position: Date }
  /** Проход пройден, новому рано. Запрашивать нечего. */
  | { action: 'wait'; pass: CatchupPass; nextPassAt: Date };

/** Пройден ли проход: позиция дошла до его конца. */
export const isCatchupPassComplete = (pass: CatchupPass, position: Date | null): boolean =>
  position !== null && position >= pass.to;

/** Решает, что делать запуску догона: начать проход, продолжить идущий или ждать. */
export const planCatchupPass = (state: CatchupState, now: Date, config: SyncConfig): CatchupPlan => {
  if (state.passFrom && state.passTo) {
    const pass: CatchupPass = { from: state.passFrom, to: state.passTo };

    if (!isCatchupPassComplete(pass, state.watermark)) {
      return { action: 'continue', pass, position: state.watermark ?? pass.from };
    }

    // Отсчёт — от конца прохода, а не от момента, когда он дошёл: иначе проход, шедший
    // полдня, сдвигал бы следующий на те же полдня, и сутки расползались бы с каждым разом.
    const nextPassAt = shift(pass.to, config.catchupPassEveryHours * HOUR_MS);

    if (now < nextPassAt) {
      return { action: 'wait', pass, nextPassAt };
    }
  }

  const to = shift(now, -config.lagSeconds * SECOND_MS);

  return { action: 'start', pass: { from: shift(to, -config.catchupDays * DAY_MS), to } };
};

/**
 * Следующий кусок прохода от позиции или `null`, если проход пройден.
 *
 * Кусок идёт от позиции на `SYNC_CATCHUP_SLICE_HOURS` вперёд, последний упирается в конец
 * прохода и выходит короче. Каждый кусок, кроме первого, начинается на перекрытие раньше
 * позиции: включает ли Fleet границы `ended_at.from` и `ended_at.to`, не проверено, и заказ
 * ровно на стыке иначе мог бы не попасть ни в один кусок. Повтор на стыке отсекается
 * уникальностью заказа и ключом начисления — тот же довод, что у перекрытия живого окна.
 */
export const nextCatchupSlice = (
  pass: CatchupPass,
  position: Date,
  config: SyncConfig,
): OrdersWindow | null => {
  if (isCatchupPassComplete(pass, position)) {
    return null;
  }

  // Позиция в начале прохода — это первый кусок: перекрываться ему не с чем.
  const isFirst = position <= pass.from;
  const sliceStart = isFirst ? pass.from : position;
  const endedFrom = isFirst ? pass.from : shift(position, -config.overlapMinutes * MINUTE_MS);
  const sliceEnd = shift(sliceStart, config.catchupSliceHours * HOUR_MS);

  return { endedFrom, endedTo: sliceEnd < pass.to ? sliceEnd : pass.to };
};
