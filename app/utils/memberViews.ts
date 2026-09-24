import { formatPhone } from '#shared/phone';
import type { MemberOperation, MemberOrder, MemberScreenTexts } from '#shared/types/miniapp';
import type { MemberReward } from '#shared/types/rewards';
import type { LoadState } from '~/types/loadState';
import type {
  MemberOperationDayView,
  MemberOrderDetailView,
  MemberOrderRowView,
  MemberRewardView,
  MemberViewLoad,
} from '~/types/memberView';

/**
 * Ответы ручек Mini App — свойствами новых компонентов водителя (`components/**\/next/`).
 *
 * Решений здесь нет: сервер уже перевёл всё на язык водителя, а компонент ничего не собирает
 * сам (`types/memberView.ts`). Здесь только раскладка — какое поле ответа в какое свойство,
 * разряды, знак и подписи из текстов экрана. Отдельным модулем, а не в странице: страница
 * держит запросы и переходы, а раскладка четырёх экранов утопила бы их.
 */

/** Разряды — неразрывным пробелом: «1 450» не должно переноситься посреди числа. */
export const formatPoints = (value: number): string =>
  String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Минус — типографский (U+2212), как в макетах: дефис рядом с цифрами выглядит тире переноса. */
const MINUS = '−';

/** Состояние загрузки списка вместе с пустотой: пустой ответ компонент рисует своим видом. */
const viewLoad = (state: LoadState, count: number): MemberViewLoad =>
  state === 'ready' && count === 0 ? 'empty' : state;

// История ------------------------------------------------------------------

/** Сколько операций видно на главной: короткий срез, за давней водитель идёт в раздел. */
export const HOME_HISTORY_SIZE = 6;

/**
 * Операции по дням. Сервер отдаёт их от свежих к старым, и день уже посчитан в зоне парка —
 * здесь строки только собираются под подпись своего дня.
 */
export const operationDays = (operations: readonly MemberOperation[]): MemberOperationDayView[] => {
  const days: MemberOperationDayView[] = [];

  for (const operation of operations) {
    let day = days.at(-1);

    if (!day || day.id !== operation.day) {
      day = { id: operation.day, label: operation.dayLabel, operations: [] };
      days.push(day);
    }

    day.operations.push({
      id: operation.id,
      time: operation.time,
      title: operation.reason,
      amount: `${operation.delta < 0 ? MINUS : '+'}${formatPoints(operation.delta)}`,
      direction: operation.delta < 0 ? 'minus' : 'plus',
    });
  }

  return days;
};

export const historyView = (
  state: LoadState,
  operations: readonly MemberOperation[],
): { state: MemberViewLoad; days: MemberOperationDayView[] } => ({
  state: viewLoad(state, operations.length),
  days: operationDays(operations),
});

// Заказы -------------------------------------------------------------------

/** «Офис · Чиланзар»: подпись ставит фронт, имя приходит из базы. */
const officeLine = (name: string, texts: MemberScreenTexts): string => `${texts.officeLabel} · ${name}`;

/** Сумма заказа: у выданного — со знаком минус, баллы ушли со счёта. */
const orderAmount = (order: MemberOrder, texts: MemberScreenTexts): string =>
  `${order.status === 'issued' ? MINUS : ''}${formatPoints(order.totalPoints)} ${texts.points}`;

/** Что стало с баллами — под суммой закрытого заказа. У ждущего подписи нет. */
const orderAmountCaption = (order: MemberOrder, texts: MemberScreenTexts): string | undefined => {
  switch (order.status) {
    case 'issued':
      return texts.orderAmountSpent;
    case 'cancelled':
      return texts.orderAmountReturned;
    case 'pending':
      return undefined;
  }
};

/** Офис строкой у ждущего и выданного. У отменённого нет: идти туда уже незачем. */
const orderOffice = (order: MemberOrder, texts: MemberScreenTexts): string | undefined =>
  order.status === 'cancelled' ? undefined : officeLine(order.office.name, texts);

/** Заказ карточкой раздела «Мои заказы». */
export const orderRowView = (order: MemberOrder, texts: MemberScreenTexts): MemberOrderRowView => ({
  id: order.orderId,
  title: order.title,
  status: order.status,
  state: order.stateWord,
  hint: order.stateHint,
  reason: order.reasonText ?? undefined,
  amount: orderAmount(order, texts),
  amountCaption: orderAmountCaption(order, texts),
  office: orderOffice(order, texts),
  actionLabel: order.status === 'pending' ? texts.orderActionCode : texts.orderActionView,
});

/** Заказ компактной карточкой на главной: срок и офис одной строкой, суммы нет (`orders-block.md`). */
const homeOrderRowView = (order: MemberOrder, texts: MemberScreenTexts): MemberOrderRowView => ({
  id: order.orderId,
  title: order.title,
  status: order.status,
  state: order.stateWord,
  hint: `${order.stateHint} · ${officeLine(order.office.name, texts)}`,
});

/**
 * Заказы на главной: все ждущие; ждущих нет — один первый заказ списка (сервер отдаёт висящие
 * первыми, дальше свежие); заказов нет — пусто.
 */
export const homeOrdersView = (
  state: LoadState,
  orders: readonly MemberOrder[],
  texts: MemberScreenTexts,
): { state: MemberViewLoad; items: MemberOrderRowView[] } => {
  const pending = orders.filter((order) => order.status === 'pending');
  const shown = pending.length > 0 ? pending : orders.slice(0, 1);

  return {
    state: viewLoad(state, orders.length),
    items: shown.map((order) => homeOrderRowView(order, texts)),
  };
};

/** Раздел «Мои заказы»: ждущие — сверху, остальные — в порядке ответа. */
export const ordersScreenView = (
  state: LoadState,
  orders: readonly MemberOrder[],
  texts: MemberScreenTexts,
): { state: MemberViewLoad; pending: MemberOrderRowView[]; past: MemberOrderRowView[] } => ({
  state: viewLoad(state, orders.length),
  pending: orders.filter((order) => order.status === 'pending').map((order) => orderRowView(order, texts)),
  past: orders.filter((order) => order.status !== 'pending').map((order) => orderRowView(order, texts)),
});

/**
 * Адрес фото товара — тем же правилом, что `ProductPhoto`: отметка правки в адресе, иначе
 * перезалитая картинка того же формата показывалась бы прежней из кэша.
 */
const photoUrl = (photoPath: string | null, updatedAt: string): string | undefined =>
  photoPath === null ? undefined : `/uploads/${photoPath}?v=${encodeURIComponent(updatedAt)}`;

/** Заказ целиком — экран заказа. */
export const orderDetailView = (order: MemberOrder, texts: MemberScreenTexts): MemberOrderDetailView => {
  const pending = order.status === 'pending';

  return {
    title: order.title,
    status: order.status,
    state: order.stateWord,
    hint: order.stateHint,
    reason: order.reasonText ?? undefined,
    amount: orderAmount(order, texts),
    amountCaption: orderAmountCaption(order, texts),
    office: orderOffice(order, texts),
    code: pending ? (order.code ?? undefined) : undefined,
    officeCard: pending
      ? {
          label: texts.officeLabel,
          name: order.office.name,
          address: order.office.address,
          hours: order.office.workHours,
          phone: order.office.phone === null ? null : formatPhone(order.office.phone).display,
          mapUrl: order.office.mapUrl,
        }
      : undefined,
    lines: order.lines.map((line) => {
      const caption = `${line.quantity} ${texts.pieces} · ${formatPoints(line.unitPoints)} ${texts.points}`;

      return {
        id: line.productId,
        title: line.name,
        // «2 шт. · 150 баллов за штуку»: при одной штуке цена за штуку и есть цена строки.
        caption: line.quantity > 1 ? `${caption} ${texts.orderLineEach}` : caption,
        image: photoUrl(line.photoPath, line.photoUpdatedAt),
        price: formatPoints(line.quantity * line.unitPoints),
      };
    }),
    total: formatPoints(order.totalPoints),
    cancellable: pending,
  };
};

// Награды ------------------------------------------------------------------

/** Награда карточкой на главной — из того, что ответ наград уже отдаёт. Чего нет — строки нет. */
const homeRewardView = (reward: MemberReward, texts: MemberScreenTexts): MemberRewardView => ({
  id: reward.rewardId,
  title: reward.title,
  status: reward.status,
  state: reward.stateText,
  hint: reward.status === 'awaiting' ? texts.rewardCodeInside : undefined,
  office: reward.officeName === null ? undefined : officeLine(reward.officeName, texts),
});

/** Награды на главной — тем же правилом, что заказы: все ждущие, иначе одна первая, иначе пусто. */
export const homeRewardsView = (
  state: LoadState,
  rewards: readonly MemberReward[],
  texts: MemberScreenTexts,
): { state: MemberViewLoad; items: MemberRewardView[] } => {
  const awaiting = rewards.filter((reward) => reward.status === 'awaiting');
  const shown = awaiting.length > 0 ? awaiting : rewards.slice(0, 1);

  return {
    state: viewLoad(state, rewards.length),
    items: shown.map((reward) => homeRewardView(reward, texts)),
  };
};
