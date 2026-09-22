import type {
  MemberOperationDayView,
  MemberOrderRowView,
  MemberRewardView,
} from '~/types/memberView';

/**
 * Заглушки служебной страницы `/design` — значения сняты с макетов `product/design/`.
 *
 * По объекту на экран и состояние: страница берёт объект целиком и отдаёт компоненту,
 * ничего не досчитывая. Это не словарь и не данные — рабочий экран возьмёт тексты
 * из словаря, а данные из ручек; здесь ровно то, что нарисовано в макете.
 */

// ------------------------------------------------------------------------ общие тексты

const BACK = 'Назад';
const RETRY = 'Повторить';

// --------------------------------------------------------------------------- главная

const HOME_TEXTS = {
  profile: 'Профиль',
  refresh: 'Обновить',
  promo: 'Акция: 3 дня из 5',
  balanceTitle: 'Ваши баллы',
  exchange: 'Обменять баллы',
  updated: 'Обновлено в 14:26',
  ordersTitle: 'Мои заказы',
  ordersAll: 'Все заказы',
  ordersError: 'Не удалось загрузить заказы. Попробуйте ещё раз.',
  rewardsTitle: 'Мои награды',
  rewardsAll: 'Все награды',
  rewardsError: 'Не удалось загрузить награды. Попробуйте ещё раз.',
  historyTitle: 'История баллов',
  historyAll: 'Вся история',
  historyEmpty: 'Здесь будет история начислений',
  historyError: 'Не удалось загрузить историю. Попробуйте ещё раз.',
  retry: RETRY,
};

const HOME_ORDER: MemberOrderRowView = {
  id: '1042',
  title: 'Заказ № 1042',
  status: 'pending',
  state: 'Ждёт выдачи',
  hint: 'заберите до 23.09, 14:32 · Чиланзар',
};

const HOME_ORDERS_SEVERAL: MemberOrderRowView[] = [
  HOME_ORDER,
  { id: '1044', title: 'Заказ № 1044', status: 'pending', state: 'Ждёт выдачи', hint: 'заберите до 24.09, 09:15 · Юнусабад' },
  { id: '1045', title: 'Заказ № 1045', status: 'pending', state: 'Ждёт выдачи', hint: 'заберите до 24.09, 18:40 · Чиланзар' },
];

const HOME_REWARD: MemberRewardView = {
  id: 'reward-checker',
  title: 'Шашка Taxi',
  status: 'awaiting',
  state: 'Ждёт в офисе до 5 октября',
  hint: 'код внутри',
};

const HOME_REWARDS_SEVERAL: MemberRewardView[] = [
  HOME_REWARD,
  { id: 'reward-tire', title: 'Чернитель шин', status: 'awaiting', state: 'Ждёт в офисе до 9 октября', hint: 'код внутри' },
];

/** Ждущих нет, но награды были: блок остаётся полной карточкой полученной. */
const HOME_REWARDS_NOTHING_TO_PICK: MemberRewardView[] = [
  {
    id: 'reward-freshener',
    title: 'Освежитель «Вертолёт»',
    status: 'issued',
    origin: 'Вручил парк · за помощь на линии',
    state: 'Получена 20 сентября',
    office: 'Офис на Чиланзаре',
  },
];

const HOME_HISTORY: MemberOperationDayView[] = [
  {
    id: 'today',
    label: 'Сегодня',
    operations: [
      { id: 'h1', time: '14:26', title: 'Поездка', amount: '+1', direction: 'plus' },
      { id: 'h2', time: '13:58', title: 'Поездка', amount: '+1', direction: 'plus' },
      { id: 'h3', time: '12:04', title: 'Обмен на товар · #1042', amount: '−900', direction: 'minus' },
    ],
  },
  {
    id: 'yesterday',
    label: 'Вчера',
    operations: [
      { id: 'h4', time: '21:10', title: 'Акция', amount: '+150', direction: 'plus' },
      { id: 'h5', time: '18:33', title: 'Поездка', amount: '+1', direction: 'plus' },
    ],
  },
  {
    id: '2026-09-14',
    label: '14 сентября',
    operations: [{ id: 'h6', time: '09:12', title: 'Начислено сотрудником', amount: '+50', direction: 'plus' }],
  },
];

const HOME_BASE = {
  name: 'Бахтиёр',
  callsign: 'А-247',
  points: 1450,
  texts: HOME_TEXTS,
};

/** Эталон: участник программы, акция идёт, он в ней участвует. */
export const homeMock = {
  ...HOME_BASE,
  promo: { done: 3, total: 5 },
  invite: undefined,
  orders: { state: 'ready' as const, items: [HOME_ORDER] },
  rewards: { state: 'ready' as const, items: [HOME_REWARD] },
  history: { state: 'ready' as const, days: HOME_HISTORY },
};

/** В снимке акции, но не вступил: пилюли нет, под баллами плашка приглашения. */
export const homeInviteMock = {
  ...homeMock,
  promo: undefined,
  invite: { kicker: 'Для вас открыта акция', title: 'Ваши сундуки\nуже ждут', when: 'с 1 по 7 октября' },
};

/** Ждут несколько заказов и наград — каждый своей строкой. */
export const homeSeveralMock = {
  ...homeMock,
  orders: { state: 'ready' as const, items: HOME_ORDERS_SEVERAL },
  rewards: { state: 'ready' as const, items: HOME_REWARDS_SEVERAL },
};

/** Забирать нечего: висящих заказов нет — блока нет; награды были — блок с полученной. */
export const homeQuietMock = {
  ...homeMock,
  promo: undefined,
  orders: { state: 'empty' as const, items: [] },
  rewards: { state: 'ready' as const, items: HOME_REWARDS_NOTHING_TO_PICK },
};

/** Новичок: заказов и наград не было — блоков нет, история пуста. */
export const homeNewcomerMock = {
  ...homeMock,
  promo: undefined,
  points: 0,
  orders: { state: 'empty' as const, items: [] },
  rewards: { state: 'empty' as const, items: [] },
  history: { state: 'empty' as const, days: [] },
};

/** Ничего не загрузилось: у каждого блока свой отказ и своё «Повторить». */
export const homeErrorsMock = {
  ...homeMock,
  orders: { state: 'error' as const, items: [] },
  rewards: { state: 'error' as const, items: [] },
  history: { state: 'error' as const, days: [] },
};

/** История ещё грузится: строки ожидания той же высоты. */
export const homeLoadingMock = {
  ...homeMock,
  history: { state: 'loading' as const, days: [] },
};

export const sharedTexts = { back: BACK, retry: RETRY };
