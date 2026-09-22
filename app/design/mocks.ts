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

// ------------------------------------------------------------------- история баллов

/** Строка истории короче: время, что, сумма. Знак суммы решает направление. */
function operation(id: string, time: string, title: string, amount: string): MemberOperationDayView['operations'][number] {
  return { id, time, title, amount, direction: amount.startsWith('−') ? 'minus' : 'plus' };
}

const HISTORY_TEXTS = {
  title: 'История баллов',
  back: BACK,
  synced: 'Поездки учтены до 22.09, 14:31',
  more: 'Показать ещё',
  empty: 'Здесь будет история начислений',
  error: 'Не удалось загрузить историю. Попробуйте ещё раз.',
  retry: RETRY,
};

/** Ровно 25 строк за четыре дня — столько отдаёт одна страница. */
const HISTORY_DAYS: MemberOperationDayView[] = [
  {
    id: 'today',
    label: 'Сегодня',
    operations: [
      operation('s1', '14:26', 'Поездка', '+1'),
      operation('s2', '13:58', 'Поездка', '+1'),
      operation('s3', '12:04', 'Обмен на товар · #1042', '−900'),
      operation('s4', '11:40', 'Поездка', '+1'),
      operation('s5', '10:22', 'Поездка', '+1'),
      operation('s6', '09:15', 'Поездка', '+1'),
      operation('s7', '08:02', 'Поездка', '+1'),
    ],
  },
  {
    id: 'yesterday',
    label: 'Вчера',
    operations: [
      operation('s8', '23:41', 'Поездка', '+1'),
      operation('s9', '22:10', 'Акция', '+150'),
      operation('s10', '21:10', 'Поездка', '+1'),
      operation('s11', '19:55', 'Поездка', '+1'),
      operation('s12', '18:33', 'Поездка', '+1'),
      operation('s13', '16:20', 'Поездка', '+1'),
      operation('s14', '14:08', 'Начислено сотрудником', '+50'),
      operation('s15', '09:30', 'Поездка', '+1'),
    ],
  },
  {
    id: '2026-09-20',
    label: '20 сентября',
    operations: [
      operation('s16', '22:15', 'Поездка', '+1'),
      operation('s17', '20:40', 'Розыгрыш', '+500'),
      operation('s18', '18:12', 'Поездка', '+1'),
      operation('s19', '15:33', 'Возврат заказа · #1039', '+900'),
      operation('s20', '12:50', 'Обмен на товар · #1039', '−900'),
      operation('s21', '09:05', 'Поездка', '+1'),
    ],
  },
  {
    id: '2026-09-19',
    label: '19 сентября',
    operations: [
      operation('s22', '21:02', 'Поездка', '+1'),
      operation('s23', '17:44', 'Поездка', '+1'),
      operation('s24', '13:26', 'Корректировка', '−12'),
      operation('s25', '10:11', 'Поездка', '+1'),
    ],
  },
];

/** Все одиннадцать причин по одной строке — лист `artboard/history-block.html`, сцена 2. */
const HISTORY_ALL_REASONS: MemberOperationDayView[] = [
  {
    id: 'today',
    label: 'Сегодня',
    operations: [
      operation('r1', '14:26', 'Поездка', '+1'),
      operation('r2', '14:20', 'Бонус за первые поездки', '+100'),
      operation('r3', '14:15', 'Перенос баланса', '+1 450'),
      operation('r4', '13:40', 'Обмен на товар · #1042', '−900'),
      operation('r5', '13:02', 'Возврат заказа · #1042', '+900'),
      operation('r6', '12:30', 'Начислено сотрудником', '+50'),
      operation('r7', '12:11', 'Списано сотрудником', '−50'),
      operation('r8', '11:45', 'Розыгрыш', '+500'),
      operation('r9', '11:20', 'Акция', '+150'),
      operation('r10', '10:05', 'Сгорание баллов', '−300'),
      operation('r11', '09:30', 'Корректировка', '−12'),
    ],
  },
];

export const historyMock = { state: 'ready' as const, days: HISTORY_DAYS, hasMore: true, texts: HISTORY_TEXTS };
export const historyReasonsMock = { ...historyMock, days: HISTORY_ALL_REASONS, hasMore: false };
export const historyEmptyMock = { ...historyMock, state: 'empty' as const, days: [], hasMore: false };
export const historyErrorMock = { ...historyMock, state: 'error' as const, days: [], hasMore: false };
export const historyLoadingMock = { ...historyMock, state: 'loading' as const, days: [], hasMore: false };
