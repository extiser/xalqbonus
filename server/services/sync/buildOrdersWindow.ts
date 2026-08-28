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
import type { OrdersSyncKind, SyncConfig } from '#server/services/sync/config';

export type OrdersWindowInput = {
  kind: OrdersSyncKind;
  /** Отметка синхронизации этого вида. Пусто — прогонов ещё не было. */
  watermark: Date | null;
  now: Date;
  config: SyncConfig;
};

const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;
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
 * Догоняющее окно: широкая полоса порядка недели, своя отметка, тот же код записи.
 *
 * Заказ, провисевший в промежуточном статусе несколько дней, получает время завершения
 * в прошлом. Если скользящее окно эту точку уже прошло, такой заказ не увидит никто
 * и никогда — тот же класс ошибки, что убил старого бота, зашедший с другой стороны
 * (docs/decisions.md → «Скользящего окна недостаточно»).
 *
 * Нижняя граница берётся более ранней из двух: заданной ширины и собственной отметки
 * с перекрытием. Первое даёт постоянную глубину перепросмотра, второе не даёт пропуска,
 * если догоняющий прогон не отработал несколько суток подряд.
 */
const buildCatchupWindow = (input: OrdersWindowInput): OrdersWindow => {
  const { config } = input;
  const endedTo = shift(input.now, -config.lagSeconds * SECOND_MS);
  const wideFrom = shift(endedTo, -config.catchupDays * DAY_MS);

  // Без отметки брать нечего, кроме заданной ширины: перекрытие пристраивается к отметке,
  // а не к пустому месту.
  if (!input.watermark) {
    return { endedFrom: wideFrom, endedTo };
  }

  const fromWatermark = shift(input.watermark, -config.overlapMinutes * MINUTE_MS);

  return {
    endedFrom: fromWatermark < wideFrom ? fromWatermark : wideFrom,
    endedTo,
  };
};

/**
 * Возвращает окно прогона или `null`, если запрашивать нечего.
 *
 * Пустое окно — не ошибка: так выглядит прогон, запущенный чаще, чем идёт время
 * (интервал меньше отставания), или сразу после предыдущего успешного. Прогон при этом
 * не заводится вовсе, и отметка остаётся на месте.
 */
export const buildOrdersWindow = (input: OrdersWindowInput): OrdersWindow | null => {
  const window =
    input.kind === 'orders_catchup' ? buildCatchupWindow(input) : buildLiveWindow(input);

  return window.endedTo > window.endedFrom ? window : null;
};
