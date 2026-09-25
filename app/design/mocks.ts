import type {
  MemberCartLineView,
  MemberCatalogOfficeView,
  MemberChestCardView,
  MemberChestKind,
  MemberChestRowView,
  MemberGiftView,
  MemberHeatStage,
  MemberOperationDayView,
  MemberOrderDetailView,
  MemberLanguage,
  MemberLanguageOptionView,
  MemberManagerIdsView,
  MemberOfficeView,
  MemberOrderRowView,
  MemberProductView,
  MemberProfileFieldView,
  MemberPromoRuleView,
  MemberRewardDetailView,
  MemberRewardTicketView,
  MemberRewardView,
  MemberWeekDayView,
} from '~/types/memberView';

/**
 * Заглушки служебной страницы `/design` — значения сняты с макетов `_reference/design/`.
 *
 * По объекту на экран и состояние: страница берёт объект целиком и отдаёт компоненту,
 * ничего не досчитывая. Это не словарь и не данные — рабочий экран возьмёт тексты
 * из словаря, а данные из ручек; здесь ровно то, что нарисовано в макете.
 */

// ------------------------------------------------------------------------ общие тексты

const BACK = 'Назад';
const RETRY = 'Повторить';

/** Ссылка на карту у офисов: в макетах её значения нет, нарисована только строка карты. */
const MAP_URL = 'https://yandex.uz/maps/';

/** Баланс справа в шапке раздела — `_reference/design/home/catalog-bar.html`, число из экранов разделов. */
const BAR_BALANCE = { label: 'Ваши баллы', amount: '1\u00A0450' };

/**
 * Фото товаров — вынуты из макетов `_reference/design/orders/` и `catalog/` в `public/design/products/`.
 * Power Bank есть только в каталоге.
 */
const PRODUCT_IMAGES = {
  freshener: '/design/products/freshener.jpg',
  tireBlack: '/design/products/tire-black.jpg',
  magnetHolder: '/design/products/magnet-holder.jpg',
  taxiChecker: '/design/products/taxi-checker.jpg',
  headset: '/design/products/headset.jpg',
  powerBank: '/design/products/power-bank.jpg',
};

// -------------------------------------------------------------------- товары каталога

/** Товар каталога числами: витрина, шторка подтверждения и блок на главной считают из них. */
interface CatalogProduct {
  id: string;
  name: string;
  image: string;
  points: number;
  oldPoints?: number;
  discount?: string;
  available: number;
}

/** Число баллов с пробелом между разрядами и настоящим минусом: «2 310», «−590». */
function formatPoints(value: number): string {
  const digits = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');

  return value < 0 ? `\u2212${digits}` : digits;
}

/** Товары витрины `_reference/design/catalog/catalog-showcase.html`, по порядку сетки. */
const POWER_BANK: CatalogProduct = {
  id: 'power-bank',
  name: 'Power Bank 20 000 mAh',
  image: PRODUCT_IMAGES.powerBank,
  points: 1720,
  oldPoints: 4300,
  discount: '\u221260%',
  available: 8,
};

/** Название длиннее 30 символов — на плитке видно, как оно срезается. В макете — «Bluetooth гарнитура». */
const HEADSET: CatalogProduct = {
  id: 'headset',
  name: 'Bluetooth-гарнитура с шумоподавлением',
  image: PRODUCT_IMAGES.headset,
  points: 1320,
  oldPoints: 3300,
  discount: '\u221260%',
  available: 3,
};

const CHECKER: CatalogProduct = {
  id: 'checker',
  name: 'Шашка Taxi',
  image: PRODUCT_IMAGES.taxiChecker,
  points: 900,
  oldPoints: 1500,
  discount: '\u221240%',
  available: 14,
};

const FRESHENER: CatalogProduct = {
  id: 'freshener',
  name: 'Освежитель «Вертолёт»',
  image: PRODUCT_IMAGES.freshener,
  points: 590,
  oldPoints: 840,
  discount: '\u221230%',
  available: 22,
};

const TIRE: CatalogProduct = {
  id: 'tire',
  name: 'Чернитель шин',
  image: PRODUCT_IMAGES.tireBlack,
  points: 750,
  available: 31,
};

/** Второе название длиннее 30 символов. В макете — «Магнитный держатель». */
const MAGNET: CatalogProduct = {
  id: 'magnet',
  name: 'Магнитный держатель для телефона на дефлектор',
  image: PRODUCT_IMAGES.magnetHolder,
  points: 225,
  available: 45,
};

/** Корзина: сколько взято каждого товара. */
export type CatalogCart = Record<string, number>;

function productView(product: CatalogProduct, cart: CatalogCart): MemberProductView {
  return {
    id: product.id,
    name: product.name,
    image: product.image,
    price: formatPoints(product.points),
    oldPrice: product.oldPoints === undefined ? undefined : formatPoints(product.oldPoints),
    discount: product.discount,
    stock: `${product.available} шт`,
    count: cart[product.id] ?? 0,
    available: product.available,
  };
}

// --------------------------------------------------------------------------- главная

const HOME_TEXTS = {
  profile: 'Профиль',
  promo: 'Акция: 3 дня из 5',
  balanceTitle: 'Ваши баллы',
  exchange: 'Обменять баллы',
  updated: 'Обновлено в 14:26',
  ordersTitle: 'Мои заказы',
  ordersAll: 'Все заказы',
  ordersEmpty: 'Здесь появятся товары, которые вы обменяете на баллы.',
  ordersError: 'Не удалось загрузить заказы. Попробуйте ещё раз.',
  rewardsTitle: 'Мои награды',
  rewardsAll: 'Все награды',
  rewardsGiftHint: 'нажмите, чтобы забрать',
  rewardsEmpty: 'Здесь появятся награды из акций и подарки от парка — баллы, товары и призы.',
  rewardsError: 'Не удалось загрузить награды. Попробуйте ещё раз.',
  catalogTitle: 'Каталог',
  catalogAll: 'Весь каталог',
  catalogSale: 'SALE',
  catalogEmpty: 'Здесь появятся товары, которые можно взять за баллы.',
  catalogError: 'Не удалось загрузить товары. Попробуйте ещё раз.',
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
  hint: 'заберите до 23.09, 14:32 · Офис · Чиланзар',
};

/** «Офис · Юнусабад» — со словом «Офис», как у соседних строк: в макете у этой строки правка недонесена. */
const HOME_ORDERS_SEVERAL: MemberOrderRowView[] = [
  HOME_ORDER,
  { id: '1044', title: 'Заказ № 1044', status: 'pending', state: 'Ждёт выдачи', hint: 'заберите до 24.09, 09:15 · Офис · Юнусабад' },
  { id: '1045', title: 'Заказ № 1045', status: 'pending', state: 'Ждёт выдачи', hint: 'заберите до 24.09, 18:40 · Офис · Чиланзар' },
];

/** Ждущих нет, но заказы были: один последний, выданный. */
const HOME_ORDER_LAST_ISSUED: MemberOrderRowView = {
  id: '1039',
  title: 'Заказ № 1039',
  status: 'issued',
  state: 'Выдан',
  hint: '20.09.2026, 16:10 · Офис · Чиланзар',
};

/** Ждущих нет, последним оказался отменённый: офиса нет, причина — на экране заказа. */
const HOME_ORDER_LAST_CANCELLED: MemberOrderRowView = {
  id: '1031',
  title: 'Заказ № 1031',
  status: 'cancelled',
  state: 'Отменён',
  hint: '18.09.2026, 09:40',
};

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

/** Ждущих нет, но награды были: одна последняя полной карточкой. */
const HOME_REWARDS_NOTHING_TO_PICK: MemberRewardView[] = [
  {
    id: 'reward-freshener',
    title: 'Освежитель «Вертолёт»',
    status: 'issued',
    origin: 'Вручил парк · за помощь на линии',
    state: 'Получена 20 сентября',
    office: 'Офис · Чиланзар',
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

/** Блок каталога на главной — `_reference/design/catalog/catalog-block.html`: четыре товара со скидкой. */
const HOME_CATALOG: MemberProductView[] = [POWER_BANK, HEADSET, CHECKER, FRESHENER].map((product) => productView(product, {}));

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
  catalog: { state: 'ready' as const, products: HOME_CATALOG },
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

/** Забирать нечего, без акции: ждущих нет — последний заказ выдан, последняя награда получена. */
export const homeQuietMock = {
  ...homeMock,
  promo: undefined,
  orders: { state: 'ready' as const, items: [HOME_ORDER_LAST_ISSUED] },
  rewards: { state: 'ready' as const, items: HOME_REWARDS_NOTHING_TO_PICK },
};

/** То же, последним заказом оказался отменённый. */
export const homeQuietCancelledMock = {
  ...homeQuietMock,
  orders: { state: 'ready' as const, items: [HOME_ORDER_LAST_CANCELLED] },
};

/** Новичок: заказов и наград не было — блоки объясняют, что в них появится; история пуста. */
export const homeNewcomerMock = {
  ...homeMock,
  promo: undefined,
  points: 0,
  orders: { state: 'empty' as const, items: [] },
  rewards: { state: 'empty' as const, items: [] },
  catalog: { state: 'empty' as const, products: [] },
  history: { state: 'empty' as const, days: [] },
};

/** Ничего не загрузилось: у каждого блока свой отказ и своё «Повторить». */
export const homeErrorsMock = {
  ...homeMock,
  orders: { state: 'error' as const, items: [] },
  rewards: { state: 'error' as const, items: [] },
  catalog: { state: 'error' as const, products: [] },
  history: { state: 'error' as const, days: [] },
};

/** История ещё грузится: строки ожидания той же высоты. */
export const homeLoadingMock = {
  ...homeMock,
  history: { state: 'loading' as const, days: [] },
};


// ------------------------------------------------------------------- история баллов

/** Строка истории короче: время, что, сумма. Знак суммы решает направление. */
function operation(id: string, time: string, title: string, amount: string): MemberOperationDayView['operations'][number] {
  return { id, time, title, amount, direction: amount.startsWith('−') ? 'minus' : 'plus' };
}

const HISTORY_TEXTS = {
  title: 'История баллов',
  back: BACK,
  synced: 'Поездки учтены до 22.09, 14:31',
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

export const historyMock = { state: 'ready' as const, days: HISTORY_DAYS, hasMore: true, balance: BAR_BALANCE, texts: HISTORY_TEXTS };
export const historyReasonsMock = { ...historyMock, days: HISTORY_ALL_REASONS, hasMore: false };
export const historyEmptyMock = { ...historyMock, state: 'empty' as const, days: [], hasMore: false };
export const historyErrorMock = { ...historyMock, state: 'error' as const, days: [], hasMore: false };
export const historyLoadingMock = { ...historyMock, state: 'loading' as const, days: [], hasMore: false };
/** Долистал до конца — следующая страница в пути: внизу три строки ожидания. */
export const historyMoreLoadingMock = { ...historyMock, hasMore: true, loadingMore: true };
/** Следующая страница не пришла: отказ строкой и «Повторить» под ним. */
export const historyMoreFailedMock = { ...historyMock, hasMore: true, moreFailed: true };

// ---------------------------------------------------------------------- мои награды

/** «Здесь пусто» под группой без ждущих — `_reference/design/orders/*-screen-nopending.html`. */
const GROUP_EMPTY = 'Здесь пусто';

const REWARDS_TEXTS = {
  title: 'Мои награды',
  back: BACK,
  giftsGroup: 'Подарки от Xalq Taxi',
  take: 'Забрать',
  awaitingGroup: 'Ждут в офисе',
  pastGroup: 'История наград',
  groupEmpty: GROUP_EMPTY,
  empty: 'Здесь появятся награды из акций и подарки от парка — баллы, товары и призы.',
  error: 'Не удалось загрузить награды. Попробуйте ещё раз.',
  retry: RETRY,
};

const REWARDS_AWAITING: MemberRewardView[] = [
  {
    id: 'reward-checker',
    title: 'Шашка Taxi',
    status: 'awaiting',
    origin: 'Акция «Неделя возвращения» · сундук недели',
    state: 'Ждёт в офисе',
    hint: 'до 5 октября',
    office: 'Офис · Чиланзар',
    actionLabel: 'Код для выдачи — внутри',
  },
  {
    id: 'reward-tire',
    title: 'Чернитель шин',
    status: 'awaiting',
    origin: 'Акция «Неделя возвращения» · сундук трёх дней',
    state: 'Ждёт в офисе',
    hint: 'до 9 октября',
    office: 'Офис · Чиланзар',
    actionLabel: 'Код для выдачи — внутри',
  },
];

/**
 * История — из `rewards-screen.html`. В `rewards-screen-nopending.html` история нарисована прежним
 * видом карточки, который `rewards-screen.md` называет заменённым; с этого листа берётся только
 * группа с нулём.
 */
const REWARDS_PAST: MemberRewardView[] = [
  {
    id: 'reward-300',
    title: '300 баллов',
    status: 'credited',
    origin: 'Акция «Неделя возвращения» · сундук дня',
    state: 'На балансе',
    hint: '21.09.2026',
  },
  {
    id: 'reward-freshener',
    title: 'Освежитель «Вертолёт»',
    status: 'issued',
    origin: 'Вручил парк · за помощь на линии',
    state: 'Получена',
    hint: '20.09.2026, 16:10',
    office: 'Офис · Чиланзар',
    actionLabel: 'Просмотреть',
  },
  {
    id: 'reward-150',
    title: '150 баллов',
    status: 'credited',
    origin: 'Акция «Неделя возвращения» · сундук дня',
    state: 'На балансе',
    hint: '19.09.2026',
  },
  {
    id: 'reward-aroma',
    title: 'Ароматизатор «Гранат»',
    status: 'expired',
    origin: 'Акция «Неделя возвращения» · сундук дня',
    state: 'Срок вышел',
    hint: '12.09.2026',
    reason: 'Не забрали в офисе до срока',
    actionLabel: 'Просмотреть',
  },
];

export const rewardsMock = {
  state: 'ready' as const,
  awaiting: REWARDS_AWAITING,
  past: REWARDS_PAST,
  balance: BAR_BALANCE,
  texts: REWARDS_TEXTS,
};
export const rewardsNoPendingMock = { ...rewardsMock, awaiting: [] };
export const rewardsEmptyMock = { ...rewardsMock, state: 'empty' as const, awaiting: [], past: [] };
export const rewardsErrorMock = { ...rewardsMock, state: 'error' as const, awaiting: [], past: [] };

// -------------------------------------------------------------------------- подарки

/** Подарки от Xalq Taxi — `_reference/design/gifts/`. Третий есть только в сцене «Забрать». */
const GIFT_TEACHER: MemberGiftView = {
  id: 'gift-teacher',
  title: '300 баллов в подарок',
  reason: 'Xalq Taxi · ко Дню учителя',
  deadline: 'Заберите до 5 октября',
};

const GIFT_INDEPENDENCE: MemberGiftView = {
  id: 'gift-independence',
  title: '500 баллов в подарок',
  reason: 'Xalq Taxi · ко Дню независимости',
  deadline: 'Заберите до 12 октября',
};

const GIFT_LINE: MemberGiftView = {
  id: 'gift-line',
  title: '150 баллов в подарок',
  reason: 'Xalq Taxi · за помощь на линии',
  deadline: 'Заберите до 20 октября',
};

/** Главная с подарками — `main-screen-gift-sheet.html` (один) и `main-screen-gift.html` (два). */
export function homeGiftsMock(gifts: MemberGiftView[] = [GIFT_TEACHER, GIFT_INDEPENDENCE]) {
  return { ...homeMock, rewards: { state: 'ready' as const, items: [HOME_REWARD], gifts } };
}

/** В сцене «Забрать» вторая карточка с первого раза не забирается — как в скрипте макета. */
export const GIFT_TAKE_ERROR = 'Не удалось забрать подарок. Попробуйте ещё раз.';

export type GiftSheetScene = 'one' | 'several' | 'take';

/**
 * Шторка подарков над главной: `one` — `main-screen-gift-sheet.html`, `several` —
 * `main-screen-gifts-sheet.html`, `take` — `main-screen-gifts-take.html`. Под шторкой главная
 * своего макета: в `take` на ней два подарка, в шторке — три.
 */
export function giftSheetMock(scene: GiftSheetScene) {
  const home = scene === 'one' ? [GIFT_TEACHER] : [GIFT_TEACHER, GIFT_INDEPENDENCE];
  const sheet = scene === 'take' ? [GIFT_TEACHER, GIFT_INDEPENDENCE, GIFT_LINE] : home;

  return {
    home,
    sheet,
    /** Сбой с первого раза — у второй карточки и только в сцене «Забрать». */
    failOnce: scene === 'take' ? [GIFT_INDEPENDENCE.id] : [],
    texts: {
      title: sheet.length === 1 ? 'Подарок от Xalq Taxi' : 'Подарки от Xalq Taxi',
      subtitle: 'Баллы придут на счёт, как только заберёте',
      take: 'Забрать',
      takeAll: 'Забрать всё',
      close: 'Закрыть',
    },
  };
}

/** «Мои награды» с группой подарков — `rewards-screen-gift.html`. */
export const rewardsGiftsMock = { ...rewardsMock, gifts: [GIFT_TEACHER, GIFT_INDEPENDENCE] };

// ----------------------------------------------------------------------- мои заказы

const ORDERS_TEXTS = {
  title: 'Мои заказы',
  back: BACK,
  pendingGroup: 'Ждут выдачи',
  pastGroup: 'История заказов',
  groupEmpty: GROUP_EMPTY,
  empty: 'Здесь появятся товары, которые вы обменяете на баллы.',
  error: 'Не удалось загрузить заказы. Попробуйте ещё раз.',
  retry: RETRY,
};

const ORDERS_PENDING: MemberOrderRowView[] = [
  {
    id: '1042',
    title: 'Заказ № 1042',
    status: 'pending',
    state: 'Ждёт выдачи',
    hint: 'заберите до 23.09, 14:32',
    amount: '900 баллов',
    office: 'Офис · Чиланзар',
    actionLabel: 'Код для выдачи — внутри',
  },
];

const ORDERS_PAST: MemberOrderRowView[] = [
  {
    id: '1039',
    title: 'Заказ № 1039',
    status: 'issued',
    state: 'Выдан',
    hint: '20.09.2026, 16:10',
    amount: '−450 баллов',
    amountCaption: 'списано со счёта',
    office: 'Офис · Чиланзар',
    actionLabel: 'Просмотреть',
  },
  {
    id: '1031',
    title: 'Заказ № 1031',
    status: 'cancelled',
    state: 'Отменён',
    hint: '18.09.2026, 09:40',
    reason: 'Вы отменили заказ',
    amount: '1 200 баллов',
    amountCaption: 'вернулось на счёт',
    actionLabel: 'Просмотреть',
  },
  {
    id: '1024',
    title: 'Заказ № 1024',
    status: 'cancelled',
    state: 'Отменён',
    hint: '14.09.2026, 10:00',
    reason: 'Не забрали за сутки',
    amount: '300 баллов',
    amountCaption: 'вернулось на счёт',
    actionLabel: 'Просмотреть',
  },
];

export const ordersMock = {
  state: 'ready' as const,
  pending: ORDERS_PENDING,
  past: ORDERS_PAST,
  balance: BAR_BALANCE,
  texts: ORDERS_TEXTS,
};
export const ordersNoPendingMock = { ...ordersMock, pending: [] };
export const ordersEmptyMock = { ...ordersMock, state: 'empty' as const, pending: [], past: [] };
export const ordersErrorMock = { ...ordersMock, state: 'error' as const, pending: [], past: [] };

// ---------------------------------------------------------------------- экран заказа

/** Карточка офиса «Где забрать» — одна на экраны заказа и награды. */
const PICKUP_OFFICE: MemberOfficeView = {
  label: 'Офис',
  name: 'Чиланзар',
  address: 'ул. Бунёдкор, 12',
  hours: 'Ежедневно, 09:00 — 20:00',
  phone: '+998 71 200-70-07',
  mapUrl: MAP_URL,
};

const ORDER_TEXTS = {
  back: BACK,
  codeTitle: 'Код для выдачи — назовите его в офисе',
  officeTitle: 'Где забрать',
  map: 'Открыть в Яндекс Картах',
  linesTitle: 'Состав заказа',
  total: 'Сумма',
  cancel: 'Отменить заказ',
};

/** Живой заказ: код, офис, состав и отмена. */
const ORDER_PENDING: MemberOrderDetailView = {
  title: 'Заказ № 1042',
  status: 'pending',
  state: 'Ждёт выдачи',
  hint: 'заберите до 23.09, 14:32',
  amount: '900 баллов',
  code: '31724',
  officeCard: PICKUP_OFFICE,
  lines: [
    { id: 'freshener', title: 'Освежитель «Вертолёт»', caption: '2 шт. · 150 баллов за штуку', image: PRODUCT_IMAGES.freshener, price: '300' },
    { id: 'tire', title: 'Чернитель шин', caption: '1 шт. · 400 баллов', image: PRODUCT_IMAGES.tireBlack, price: '400' },
    { id: 'magnet', title: 'Магнитный держатель', caption: '1 шт. · 200 баллов', image: PRODUCT_IMAGES.magnetHolder, price: '200' },
  ],
  total: '900',
  cancellable: true,
};

/** Выдан: единственное закрытие, в котором баллы остались списанными. */
const ORDER_ISSUED: MemberOrderDetailView = {
  title: 'Заказ № 1039',
  status: 'issued',
  state: 'Выдан',
  hint: '20.09.2026, 16:10',
  office: 'Офис · Чиланзар',
  amount: '−450 баллов',
  amountCaption: 'списано со счёта',
  lines: [
    { id: 'tire', title: 'Чернитель шин', caption: '1 шт. · 400 баллов', image: PRODUCT_IMAGES.tireBlack, price: '400' },
    { id: 'magnet', title: 'Магнитный держатель', caption: '1 шт. · 50 баллов', image: PRODUCT_IMAGES.magnetHolder, price: '50' },
  ],
  total: '450',
  cancellable: false,
};

/** Отменён водителем. */
const ORDER_CANCELLED: MemberOrderDetailView = {
  title: 'Заказ № 1031',
  status: 'cancelled',
  state: 'Отменён',
  hint: '18.09.2026, 09:40',
  reason: 'Вы отменили заказ',
  amount: '1 200 баллов',
  amountCaption: 'вернулось на счёт',
  lines: [
    { id: 'freshener', title: 'Освежитель «Вертолёт»', caption: '2 шт. · 400 баллов за штуку', image: PRODUCT_IMAGES.freshener, price: '800' },
    { id: 'checker', title: 'Шашка Taxi', caption: '1 шт. · 400 баллов', image: PRODUCT_IMAGES.taxiChecker, price: '400' },
  ],
  total: '1 200',
  cancellable: false,
};

/** Не забран за сутки — отменила просрочка, а не человек. */
const ORDER_EXPIRED: MemberOrderDetailView = {
  title: 'Заказ № 1024',
  status: 'cancelled',
  state: 'Отменён',
  hint: '14.09.2026, 10:00',
  reason: 'Не забрали за сутки',
  amount: '300 баллов',
  amountCaption: 'вернулось на счёт',
  lines: [{ id: 'headset', title: 'Bluetooth гарнитура', caption: '2 шт. · 150 баллов за штуку', image: PRODUCT_IMAGES.headset, price: '300' }],
  total: '300',
  cancellable: false,
};

export const orderMock = { order: ORDER_PENDING, balance: BAR_BALANCE, texts: ORDER_TEXTS };
export const orderIssuedMock = { order: ORDER_ISSUED, balance: BAR_BALANCE, texts: ORDER_TEXTS };
export const orderCancelledMock = { order: ORDER_CANCELLED, balance: BAR_BALANCE, texts: ORDER_TEXTS };
export const orderExpiredMock = { order: ORDER_EXPIRED, balance: BAR_BALANCE, texts: ORDER_TEXTS };

/** Шторка отмены заказа (issue #210): вопрос — заголовком, последствие — под ним, «Да» и «Нет». */
export const orderCancelSheetTexts = {
  question: 'Отменить заказ?',
  hint: 'Баллы вернутся на баланс.',
  yes: 'Да',
  no: 'Нет',
};

/** Отказ отмены — текст `order_denied_not_pending`: заказ выдали, пока шторка была открыта. */
export const ORDER_CANCEL_DENIED = 'Этот заказ уже выдан или отменён.';

// --------------------------------------------------------------------- экран награды

const REWARD_TEXTS = {
  title: 'Награда',
  back: BACK,
  codeTitle: 'Код для выдачи — покажите этот экран в офисе',
  officeTitle: 'Где забрать',
  map: 'Открыть в Яндекс Картах',
  linesTitle: 'Награда',
  total: 'Сумма',
};

/** Награда-товар строкой: цена из каталога зачёркнута, рядом «0». */
const REWARD_CHECKER_LINE = {
  id: 'checker',
  title: 'Шашка Taxi',
  caption: '1 шт.',
  image: PRODUCT_IMAGES.taxiChecker,
  oldPrice: '1 500',
  price: '0',
};

const REWARD_WEEK_ORIGIN = 'Акция «Неделя возвращения» · сундук недели';

export const rewardMock = {
  reward: {
    status: 'awaiting',
    origin: REWARD_WEEK_ORIGIN,
    state: 'Ждёт в офисе',
    hint: 'заберите до 5 октября',
    code: '73418',
    officeCard: PICKUP_OFFICE,
    lines: [REWARD_CHECKER_LINE],
    total: '0',
  } satisfies MemberRewardDetailView,
  texts: REWARD_TEXTS,
};

/** Произвольная награда: фото и цены нет — значок подарка, ни цены, ни «Суммы». «Сертификат на мойку» — демонстрационный. */
export const rewardCustomMock = {
  reward: {
    status: 'awaiting',
    origin: 'Вручил парк · за помощь на линии',
    state: 'Ждёт в офисе',
    hint: 'заберите до 5 октября',
    code: '73418',
    officeCard: PICKUP_OFFICE,
    lines: [{ id: 'wash', title: 'Сертификат на мойку', caption: '1 шт.', icon: 'gift' }],
  } satisfies MemberRewardDetailView,
  texts: REWARD_TEXTS,
};

/** Получена: где выдали — в строке состояния. */
export const rewardIssuedMock = {
  reward: {
    status: 'issued',
    origin: REWARD_WEEK_ORIGIN,
    state: 'Получена',
    hint: '20.09.2026, 16:10 · Офис · Чиланзар',
    lines: [REWARD_CHECKER_LINE],
    total: '0',
  } satisfies MemberRewardDetailView,
  texts: REWARD_TEXTS,
};

/** Срок вышел: причина под состоянием, как у отменённого заказа. */
export const rewardExpiredMock = {
  reward: {
    status: 'expired',
    origin: REWARD_WEEK_ORIGIN,
    state: 'Срок вышел',
    hint: '12.09.2026',
    reason: 'Не забрали в офисе до срока — награда сгорела',
    lines: [REWARD_CHECKER_LINE],
    total: '0',
  } satisfies MemberRewardDetailView,
  texts: REWARD_TEXTS,
};

// -------------------------------------------------------------------------- профиль

/** Названия языков — на самих языках: узбекоговорящий найдёт «O'zbek» и на русском экране. */
const LANGUAGE_OPTIONS: MemberLanguageOptionView[] = [
  { language: 'ru', label: 'Русский' },
  { language: 'uz', label: "O'zbek" },
];

/**
 * Тексты профиля на обоих языках — шторка языка меняет экран на заглушках. Узбекские
 * сняты с макета и там помечены черновыми: вычитывает переводчик перед выкатом.
 */
const PROFILE_TEXTS = {
  ru: {
    title: 'Профиль',
    back: BACK,
    settings: 'Настройки',
    language: 'Язык',
    reset: 'Сбросить сессию',
    licenseShow: 'Показать номер целиком',
    licenseHide: 'Скрыть номер',
    resetTitle: 'Сбросить сессию?',
    resetSubtitle: [
      'Приложение закроется, а бот пришлёт кнопку «Открыть приложение» — нажмите её, и всё загрузится заново.',
      'Профиль и баллы не изменятся.',
    ],
    resetConfirm: 'Сбросить',
    resetCancel: 'Отменить',
    languageSubtitle: 'Приложение и уведомления бота — на этом языке',
    save: 'Сохранить',
    close: 'Закрыть',
  },
  uz: {
    title: 'Profil',
    back: 'Orqaga',
    settings: 'Sozlamalar',
    language: 'Til',
    reset: 'Seansni qayta boshlash',
    // Подписей глазика и шторки сброса на узбекском в макете нет — стоят русские,
    // придумывать перевод здесь некому.
    licenseShow: 'Показать номер целиком',
    licenseHide: 'Скрыть номер',
    resetTitle: 'Сбросить сессию?',
    resetSubtitle: [
      'Приложение закроется, а бот пришлёт кнопку «Открыть приложение» — нажмите её, и всё загрузится заново.',
      'Профиль и баллы не изменятся.',
    ],
    resetConfirm: 'Сбросить',
    resetCancel: 'Отменить',
    languageSubtitle: 'Ilova va bot bildirishnomalari — shu tilda',
    save: 'Saqlash',
    close: 'Yopish',
  },
};

const PROFILE_FIELDS: Record<MemberLanguage, MemberProfileFieldView[]> = {
  ru: [
    { id: 'phone', label: 'Телефон', value: '+998 90 123-45-67' },
    { id: 'telegram', label: 'Telegram ID', value: '5812345670' },
    { id: 'callsign', label: 'Позывной', value: 'А-247' },
  ],
  uz: [
    { id: 'phone', label: 'Telefon', value: '+998 90 123-45-67' },
    { id: 'telegram', label: 'Telegram ID', value: '5812345670' },
    { id: 'callsign', label: 'Pozivnoy', value: 'А-247' },
  ],
};

/** Профиль на языке водителя: всё, кроме открытых шторок и глазика, — их держит страница. */
export function profileMock(language: MemberLanguage) {
  return {
    lastName: 'Рахимов',
    givenNames: 'Бахтиёр Умарович',
    fields: PROFILE_FIELDS[language],
    license: { label: language === 'ru' ? 'Номер ВУ' : 'Guvohnoma raqami', full: 'AF4471826', tail: '1826' },
    language,
    languageOptions: LANGUAGE_OPTIONS,
    texts: PROFILE_TEXTS[language],
  };
}

// ---------------------------------------------------------------- экран приглашения

const PROMO_RULES: MemberPromoRuleView[] = [
  {
    id: 'day',
    chest: 'day',
    highlighted: false,
    lines: [
      [{ text: 'Совершите', emphasis: 'plain' }],
      [{ text: '5 поездок за день\u00A0—', emphasis: 'action' }],
      [
        { text: 'откройте ', emphasis: 'plain' },
        { text: 'сундук дня', emphasis: 'gold' },
      ],
    ],
  },
  {
    id: 'week',
    chest: 'week',
    highlighted: true,
    lines: [
      [
        { text: 'Всего ', emphasis: 'plain' },
        { text: '5 таких дней', emphasis: 'strong' },
      ],
      [{ text: 'до конца недели —', emphasis: 'strong' }],
      [
        { text: 'откройте ', emphasis: 'plain' },
        { text: 'сундук недели', emphasis: 'gold' },
      ],
    ],
  },
  {
    id: '3days',
    chest: '3days',
    highlighted: false,
    lines: [
      [
        { text: 'Всего ', emphasis: 'plain' },
        { text: '3 таких дня', emphasis: 'strong' },
        { text: ' —', emphasis: 'plain' },
      ],
      [
        { text: 'и ', emphasis: 'plain' },
        { text: 'сразу', emphasis: 'strong' },
        { text: ' откройте', emphasis: 'plain' },
      ],
      [{ text: 'сундук трёх дней', emphasis: 'gold' }],
    ],
  },
];

export const promoHeroMock = {
  hello: 'Здравствуйте, Бахтиёр!',
  title: 'Ваша неделя\nвозвращения',
  invite: 'ждем вас на линии',
  period: 'c 1 по 7 октября',
  rules: PROMO_RULES,
  texts: {
    ask: 'Готовы вернуться на линию?',
    accept: 'Участвовать',
    consent: 'Нажимая «Участвовать», вы соглашаетесь с правилами акции и сообщениями о ней в этом боте',
    decline: 'Отказаться',
  },
};

// ------------------------------------------------------------------ экран участника

const WEEKDAYS = ['чт', 'пт', 'сб', 'вс', 'пн', 'вт', 'ср'] as const;

/**
 * Неделя строкой: по знаку на день окна — `d` зачтён, `s3` недобран с тремя поездками,
 * `f` впереди; `*` после знака — сегодняшний. «d,d,s3,f*,f,f,f» — снимок 4 октября.
 */
function week(pattern: string): MemberWeekDayView[] {
  return pattern.split(',').map((cell, index) => {
    const today = cell.endsWith('*');
    const code = today ? cell.slice(0, -1) : cell;
    const base = { id: `day-${index + 1}`, weekday: WEEKDAYS[index] ?? '', day: String(index + 1), today };

    if (code === 'd') {
      return { ...base, state: 'done' as const, fill: 1 };
    }

    if (code.startsWith('s')) {
      const trips = Number(code.slice(1));

      return { ...base, state: 'short' as const, fill: trips / 5, tally: `${trips}/5` };
    }

    return { ...base, state: 'future' as const, fill: 0 };
  });
}

const CHEST_NAMES: Record<MemberChestKind, string> = {
  day: 'Сундуки дня',
  '3days': 'Сундук трёх дней',
  week: 'Сундук недели',
};

function chest(
  kind: MemberChestKind,
  state: MemberChestRowView['state'],
  image: MemberChestRowView['image'],
  condition: string,
  count?: string,
): MemberChestRowView {
  return { id: kind, kind, image, name: CHEST_NAMES[kind], condition, count, state, prize: kind === 'week' };
}

/** Строки сундуков по сценам листа `03-member-chests-states.html`. */
const CHEST_SCENES: MemberChestRowView[][] = [
  [
    chest('day', 'idle', 'closed', 'по одному за взятый день'),
    chest('3days', 'idle', 'closed', 'за 3 дня с целью'),
    chest('week', 'idle', 'closed', 'за 5 дней из 7'),
  ],
  [
    chest('day', 'hot', 'ajar', 'К открытию: 1'),
    chest('3days', 'idle', 'closed', 'ещё 2 дня — и он ваш'),
    chest('week', 'idle', 'closed', 'ещё 4 дня — и он ваш'),
  ],
  [
    chest('day', 'hot', 'ajar', 'К открытию: 1'),
    chest('3days', 'idle', 'closed', 'ещё 1 день — и он ваш'),
    chest('week', 'idle', 'closed', 'ещё 3 дня — и он ваш'),
  ],
  [
    chest('day', 'hot', 'ajar', 'К открытию: 1'),
    chest('3days', 'hot', 'ajar', 'К открытию: 1'),
    chest('week', 'idle', 'closed', 'ещё 2 дня — и он ваш'),
  ],
  [
    chest('day', 'mine', 'open', 'открыты', '3'),
    chest('3days', 'mine', 'open', 'открыт'),
    chest('week', 'idle', 'closed', 'ещё 2 дня — и он ваш'),
  ],
  [
    chest('day', 'mine', 'open', 'открыты', '5'),
    chest('3days', 'mine', 'open', 'открыт'),
    chest('week', 'mine', 'closed', 'ваш — откроется в конце недели'),
  ],
  [
    chest('day', 'mine', 'open', 'открыты', '7'),
    chest('3days', 'mine', 'open', 'открыт'),
    chest('week', 'mine', 'closed', 'ваш — откроется в конце недели'),
  ],
  [
    chest('day', 'hot', 'ajar', 'К открытию: 2'),
    chest('3days', 'idle', 'closed', 'ещё 1 день — и он ваш'),
    chest('week', 'cold', 'closed', 'не в этот раз'),
  ],
  [
    chest('day', 'mine', 'open', 'открыты', '4'),
    chest('3days', 'mine', 'open', 'открыт'),
    chest('week', 'cold', 'closed', 'не в этот раз'),
  ],
  [
    chest('day', 'mine', 'open', 'открыты', '5'),
    chest('3days', 'mine', 'open', 'открыт'),
    chest('week', 'hot', 'ajar', 'К открытию: 1'),
  ],
  [
    chest('day', 'mine', 'open', 'открыты', '5'),
    chest('3days', 'mine', 'open', 'открыт'),
    chest('week', 'mine', 'open', 'открыт'),
  ],
];

/** Недели по сценам листа `03-member-week-states.html`. */
const WEEK_SCENES = [
  { term: 'осталось 7 дней', urgent: false, days: week('f*,f,f,f,f,f,f'), collected: 0, skips: '2 пропуска в запасе' },
  { term: 'осталось 4 дня', urgent: false, days: week('d,d,s3,f*,f,f,f'), collected: 2, skips: 'ещё 1 пропуск в запасе' },
  { term: 'последние 3 дня', urgent: true, days: week('d,d,s3,s0,f*,f,f'), collected: 2, skips: 'пропусков не осталось' },
  { term: 'последний день', urgent: true, days: week('d,d,s3,d,d,s1,f*'), collected: 4, skips: 'пропусков не осталось' },
  { term: 'ещё 2 дня с сундуками', urgent: true, days: week('d,d,d,d,d,f*,f'), collected: 5, skips: 'призы в конце недели' },
  { term: 'ещё 3 дня с сундуками', urgent: false, days: week('d,s2,s0,s0,f*,f,f'), collected: 1, skips: 'каждые 5 поездок — сундук' },
  { term: 'осталось 5 дней', urgent: false, days: week('d,d,d*,f,f,f,f'), collected: 3, skips: 'ещё 2 пропуска в запасе' },
];

/** Дневная цель по ступеням листа `03-member-heat-scale.html`: поездки, ступень, фраза. */
const HEAT_SCENES: { done: number; stage: MemberHeatStage; note: string }[] = [
  { done: 0, stage: 1, note: 'Сундук дня ждёт: всего 5 поездок' },
  { done: 1, stage: 1, note: 'Сундук дня ждёт: всего 4 поездки' },
  { done: 2, stage: 2, note: 'Сундук дня ждёт: всего 3 поездки' },
  { done: 3, stage: 2, note: 'Сундук дня ждёт: всего 2 поездки' },
  { done: 4, stage: 3, note: 'Сундук дня рядом: всего 1 поездка' },
  { done: 5, stage: 3, note: 'Ура! Сундук дня ваш!' },
];

const CAMPAIGN_TEXTS = {
  profile: 'Профиль',
  refresh: 'Обновить',
  promo: 'Акция',
  today: 'Сегодня',
  unit: 'поездок',
  take: 'Открыть сундук',
  updated: 'Обновлено в 14:26',
  weekTitle: 'Ваша неделя',
  collectedRest: 'из 5 дней',
};

/**
 * Экран участника: снимок 4 октября — два дня зачтены, в третий не добрал, сегодня три
 * из пяти. Любую из трёх частей можно подменить сценой её листа.
 */
export function campaignMock(scene: { heat?: number; week?: number; chests?: number } = {}) {
  const heat = HEAT_SCENES[scene.heat ?? 3] ?? HEAT_SCENES[3]!;

  return {
    name: 'Бахтиёр',
    callsign: 'А-247',
    balance: '1\u00A0450',
    stage: heat.stage,
    goal: { done: heat.done, target: 5, note: heat.note },
    week: WEEK_SCENES[scene.week ?? 1] ?? WEEK_SCENES[1]!,
    chests: CHEST_SCENES[scene.chests ?? 2] ?? CHEST_SCENES[2]!,
    texts: CAMPAIGN_TEXTS,
  };
}


// ------------------------------------------------------------ шторка «Сундуки дня»

/**
 * Карточки строкой: `o` открыт, `h` к открытию, `l3` упущен с тремя поездками,
 * `t3` сегодня с тремя, `c` впереди. «o,h,l3,t3,c,c,c» — рабочая сцена эталона.
 */
function dayCards(pattern: string): MemberChestCardView[] {
  return pattern.split(',').map((code, index) => {
    const id = `day-${index + 1}`;

    if (code === 'o') {
      return { id, state: 'open' as const, label: 'открыт' };
    }

    if (code === 'h') {
      return { id, state: 'hot' as const, label: 'открыть' };
    }

    if (code.startsWith('l')) {
      return { id, state: 'lost' as const, tag: `${code.slice(1)} из 5`, label: 'упущен' };
    }

    if (code.startsWith('t')) {
      const trips = Number(code.slice(1));

      return { id, state: 'today' as const, tag: 'сегодня', label: `${trips} из 5`, fill: trips / 5 };
    }

    return { id, state: 'cold' as const, label: 'впереди' };
  });
}

const DAY_CHESTS_SUBTITLE = 'Один сундук за каждый день, в котором вы завершили 5 поездок. Открыть можно в любой день до конца акции — он не пропадёт';

/** Сцены листа `04-day-chests-sheet-states.html`; седьмая — сам вылет, он играется нажатием. */
const DAY_CHEST_SCENES = [
  { cards: dayCards('t0,c,c,c,c,c,c'), subtitle: DAY_CHESTS_SUBTITLE },
  { cards: dayCards('o,h,l3,t3,c,c,c'), subtitle: DAY_CHESTS_SUBTITLE },
  { cards: dayCards('o,l4,h,c,c,c,c'), subtitle: DAY_CHESTS_SUBTITLE },
  { cards: dayCards('o,o,o,o,o,o,o'), subtitle: DAY_CHESTS_SUBTITLE },
  {
    cards: dayCards('o,h,l3,o,o,h,l0'),
    subtitle: 'Акция закончилась. Неоткрытые сундуки вскроются сами завтра в 09:00 — награды придут в раздел «Мои награды и призы».',
  },
  { cards: dayCards('o,o,l3,o,o,o,l0'), subtitle: 'Сундуки вскрыты. Награды ждут в разделе «Мои награды и призы».' },
];

/** Награда из сундука дня — золотая ступень, сумма из эталона (заглушка: наполнение не решено). */
const DAY_CHEST_TICKET: MemberRewardTicketView = {
  tier: 'gold',
  stub: 'Сундук дня',
  title: '+36 баллов',
  subtitle: 'уже на балансе',
};

export function dayChestsMock(scene = 1) {
  const picked = DAY_CHEST_SCENES[scene] ?? DAY_CHEST_SCENES[1]!;

  return {
    cards: picked.cards,
    ticket: DAY_CHEST_TICKET,
    texts: {
      title: 'Сундуки дня',
      titleDone: 'Награда получена!',
      subtitle: picked.subtitle,
      close: 'Закрыть',
      done: 'Готово',
      note: 'Посмотреть награду можно в разделе',
      link: '«Мои награды и призы»',
    },
  };
}


// --------------------------------------------------- шторки сундука трёх дней и недели

type BigChestKind = '3days' | 'week';
type BigChestState = 'locked' | 'ready' | 'opened' | 'lost';

const BIG_CHEST = {
  '3days': {
    title: 'Сундук трёх дней',
    subtitle: 'Всего 3 дня по 5 поездок — откройте сразу, конца акции ждать не нужно',
    locked: ['Завершите 3 дня по 5 поездок', 'Завершите ещё 2 дня по 5 поездок', 'Завершите ещё 1 день по 5 поездок'],
    prize: '+132 балла',
  },
  week: {
    title: 'Сундук недели',
    subtitle: 'Всего 5 дней по 5 поездок — главный сундук акции, в нём самая крупная награда',
    locked: ['Завершите 5 дней по 5 поездок', 'Завершите ещё 3 дня по 5 поездок', 'Завершите ещё 1 день по 5 поездок'],
    prize: '+553 балла',
  },
} as const;

/**
 * Сцены листов `05-*-chest-states.html`: три закрытых с убывающим счётом, заработан,
 * открыт, упущен. Седьмая — сам вылет, он играется нажатием на заработанный.
 */
const BIG_CHEST_SCENES: { state: BigChestState; locked?: 0 | 1 | 2 }[] = [
  { state: 'locked', locked: 0 },
  { state: 'locked', locked: 1 },
  { state: 'locked', locked: 2 },
  { state: 'ready' },
  { state: 'opened' },
  { state: 'lost' },
];

export function bigChestNote(kind: BigChestKind, state: BigChestState, locked: 0 | 1 | 2 = 2): { note: string; noteLink?: string } {
  if (state === 'ready') {
    return { note: 'Нажмите, чтобы открыть' };
  }

  if (state === 'opened') {
    return { note: 'Награда получена — она в разделе', noteLink: '«Мои награды и призы»' };
  }

  if (state === 'lost') {
    return { note: 'Не в этот раз — окно закончилось' };
  }

  return { note: BIG_CHEST[kind].locked[locked] };
}

export function bigChestMock(kind: BigChestKind, scene = 3) {
  const picked = BIG_CHEST_SCENES[scene] ?? BIG_CHEST_SCENES[3]!;
  const chest = BIG_CHEST[kind];

  return {
    kind,
    state: picked.state,
    ticket: { tier: 'gold' as const, stub: chest.title, title: chest.prize, subtitle: 'уже на балансе' },
    texts: {
      title: chest.title,
      titleDone: 'Награда получена!',
      subtitle: chest.subtitle,
      ...bigChestNote(kind, picked.state, picked.locked),
      close: 'Закрыть',
      done: 'Готово',
      revealNote: 'Посмотреть награду можно в разделе',
      link: '«Мои награды и призы»',
    },
  };
}

// ------------------------------------------------------------ регистрация и служебные экраны
// Тексты — из словарей `T` макетов `registration/*.html`, где он есть, иначе из разметки.
// Узбекские — черновые, как в макетах: их вычитывает переводчик.

/** Двуязычная заглушка «не загрузилось» — `registration/state-load-failed.html`. */
export const loadFailedMock = {
  blocks: [
    { title: "Yuklab bo'lmadi", paragraphs: ["Ma'lumotlarni yuklab bo'lmadi.\nQaytadan urinib ko'ring."] },
    { title: 'Не удалось загрузить', paragraphs: ['Не удалось загрузить данные.\nПопробуйте ещё раз.'] },
  ],
  retryLabel: 'Yangilash / Обновить',
};

/** Открыто не из Telegram — `registration/state-not-telegram.html`: кнопки нет. */
export const notTelegramMock = {
  blocks: [
    {
      title: 'Telegram orqali oching',
      paragraphs: ['Ilova faqat Telegram ichida ishlaydi.\nBotni oching va «Ilovani ochish» tugmasini bosing.'],
    },
    {
      title: 'Откройте через Telegram',
      paragraphs: ['Приложение работает только внутри Telegram.\nОткройте бота и нажмите «Открыть приложение».'],
    },
  ],
  retryLabel: null,
};

/** Устаревший Telegram — `registration/state-outdated-telegram.html`: один язык, два абзаца, кнопки нет. */
export const outdatedTelegramMock = {
  blocks: [
    {
      title: 'Обновите Telegram',
      paragraphs: [
        'Ваш Telegram устарел: поделиться номером внутри приложения в нём нельзя.',
        'Обновите Telegram до последней версии и откройте приложение снова.',
      ],
    },
  ],
  retryLabel: null,
};

/** Шаг 1, язык — `registration/registration-language.html`: словаря нет, тексты из разметки. */
export const registrationLanguageMock = {
  welcome: {
    uz: {
      title: "XalqTaxi BonusBot'ga\nxush kelibsiz!",
      lead: "Bu yerda safarlaringiz uchun ballar to'planadi — ularni park ofislarida sovg'alarga almashtirish mumkin.",
    },
    ru: {
      title: 'Добро пожаловать\nв XalqTaxi BonusBot',
      lead: 'Здесь копятся ваши баллы за поездки —\nих можно обменять на подарки в офисах парка.',
    },
  },
  selectLanguage: 'Tilni tanlang / Выберите язык',
  languageUz: "O'zbekcha",
  languageRu: 'Русский',
};

const REGISTRATION_PHONE_TEXTS = {
  ru: {
    title: 'Баллы за каждую поездку',
    lead: 'Отправьте номер телефона, на который вы оформлены в таксопарке, — и программа заработает.',
    perks: ['Начисляются автоматически после поездки', 'Подарки в офисах парка', 'Акции с сундуками и призами'],
    ask: 'Telegram спросит разрешение отправить номер — нажмите «Поделиться».',
    send: 'Отправить номер телефона',
    checking: 'Проверяем ваш номер в базе таксопарка, это займёт несколько секунд…',
  },
  uz: {
    title: 'Har bir safar uchun ball',
    lead: "Taksoparkda ro'yxatdan o'tgan telefon raqamingizni yuboring — dastur ishga tushadi.",
    perks: ['Safardan keyin avtomatik hisoblanadi', "Park ofislarida sovg'alar", 'Sandiq va sovrinli aksiyalar'],
    ask: "Telegram raqamni yuborishga ruxsat so'raydi — «Ulashish» tugmasini bosing.",
    send: 'Telefon raqamini yuborish',
    checking: "Telefon raqamingiz taksopark ma'lumotlar bazasida tekshirilmoqda, bu bir necha soniya davom etadi…",
  },
} satisfies Record<MemberLanguage, unknown>;

/** Шаг 2, номер — `registration/registration-screen.html`. */
export function registrationPhoneMock(language: MemberLanguage) {
  return { texts: REGISTRATION_PHONE_TEXTS[language] };
}

/** Общее для отказов: подписи «Покажите менеджеру», офисов и карты. */
const OUTCOME_COMMON_TEXTS = {
  ru: { ids: 'Покажите менеджеру', phone: 'Телефон', offices: 'Офисы Xalq Taxi', office: 'Офис', map: 'Открыть в Яндекс Картах' },
  uz: { ids: "Menejerga ko'rsating", phone: 'Telefon', offices: 'Xalq Taxi ofislari', office: 'Ofis', map: 'Yandex Kartada ochish' },
} satisfies Record<MemberLanguage, unknown>;

/**
 * Номер и Telegram ID из макетов. Подписи кнопок копирования в словарях макетов есть только
 * по-русски, и при переключении макет их не меняет — здесь так же.
 */
function managerIds(language: MemberLanguage): MemberManagerIdsView {
  return {
    texts: {
      title: OUTCOME_COMMON_TEXTS[language].ids,
      phoneLabel: OUTCOME_COMMON_TEXTS[language].phone,
      telegramIdLabel: 'Telegram ID',
      copyPhone: 'Скопировать номер',
      copyTelegramId: 'Скопировать Telegram ID',
    },
    phone: { display: '+998 90 123-45-67', copy: '+998901234567' },
    telegramId: '5812345670',
  };
}

/** Три офиса старого бота; адрес, часы и телефон в макетах — заглушки, разметкой, без перевода. */
function registrationOffices(language: MemberLanguage): MemberOfficeView[] {
  return ['Кадышева', 'Сергели', 'ТТЗ'].map((name) => ({
    label: OUTCOME_COMMON_TEXTS[language].office,
    name,
    address: 'Адрес — заглушка',
    hours: 'Часы работы — заглушка',
    phone: '+998 71 000-00-00',
    mapUrl: MAP_URL,
  }));
}

const OUTCOME_TEXTS = {
  refused: {
    ru: {
      title: 'Нужно зайти в офис',
      paragraphs: [
        'Вы уже зарегистрированы в программе, но с другого аккаунта Telegram. Откройте бота с него — баллы на месте. Если доступа к тому аккаунту больше нет, подойдите в офис с водительским удостоверением.',
      ],
    },
    uz: {
      title: 'Ofisga kelishingiz kerak',
      paragraphs: [
        "Siz dasturda allaqachon ro'yxatdan o'tgansiz, lekin boshqa Telegram akkaunti orqali. Botni o'sha akkauntdan oching — ballaringiz joyida. Agar o'sha akkauntga kira olmasangiz, haydovchilik guvohnomangiz bilan ofisga murojaat qiling.",
      ],
    },
  },
  retry: {
    ru: {
      title: 'Не получилось проверить номер',
      paragraphs: [
        'Сейчас не получилось проверить ваш номер. Попробуйте, пожалуйста, через несколько минут.',
        'Если не получается с нескольких попыток — обратитесь в ближайший офис Xalq Taxi.',
      ],
    },
    uz: {
      title: "Raqamni tekshirib bo'lmadi",
      paragraphs: [
        "Hozir raqamingizni tekshirib bo'lmadi. Iltimos, bir necha daqiqadan so'ng qayta urinib ko'ring.",
        "Bir necha urinishdan keyin ham bo'lmasa — eng yaqin Xalq Taxi ofisiga murojaat qiling.",
      ],
    },
  },
  employee: {
    ru: {
      title: 'Нужно зайти в офис',
      paragraphs: ['Зарегистрироваться с этого аккаунта не получится.\nОбратитесь в офис Xalq Taxi — там помогут.'],
    },
    uz: {
      title: 'Ofisga kelishingiz kerak',
      paragraphs: ["Bu akkaunt orqali ro'yxatdan o'tib bo'lmaydi.\nXalq Taxi ofisiga murojaat qiling — u yerda yordam berishadi."],
    },
  },
  employeeDenied: {
    ru: { title: 'Доступ закрыт', paragraphs: ['Чтобы его вернуть, обратитесь к руководителю парка.'] },
    uz: { title: 'Kirish yopilgan', paragraphs: ['Uni qaytarish uchun park rahbariga murojaat qiling.'] },
  },
} satisfies Record<string, Record<MemberLanguage, { title: string; paragraphs: string[] }>>;

/** Низ повтора — `registration/registration-retry.html`: как у шага 2 и строка сбоя. */
const RETRY_FOOT_TEXTS = {
  ru: {
    ask: 'Telegram спросит разрешение отправить номер — нажмите «Поделиться».',
    send: 'Отправить номер ещё раз',
    failed: 'Проверка номера не прошла — попробуйте ещё раз',
    checking: 'Проверяем ваш номер в базе таксопарка, это займёт несколько секунд…',
  },
  uz: {
    ask: "Telegram raqamni yuborishga ruxsat so'raydi — «Ulashish» tugmasini bosing.",
    send: 'Raqamni qayta yuborish',
    failed: "Raqam tekshiruvidan o'tmadi — qayta urinib ko'ring",
    checking: "Telefon raqamingiz taksopark ma'lumotlar bazasida tekshirilmoqda, bu bir necha soniya davom etadi…",
  },
} satisfies Record<MemberLanguage, unknown>;

export type RegistrationOutcomeScene = keyof typeof OUTCOME_TEXTS;

/**
 * Исход регистрации: `refused` — отказ «в офис» (текст `person_already_linked`), `retry` — повтор,
 * `employee` — отказ сотруднику, `employeeDenied` — сотрудник с выключенной учёткой.
 */
export function registrationOutcomeMock(scene: RegistrationOutcomeScene, language: MemberLanguage) {
  const base = { ...OUTCOME_TEXTS[scene][language], ids: managerIds(language) };

  if (scene === 'employee' || scene === 'employeeDenied') {
    return { ...base, kind: 'employee' as const };
  }

  const offices = {
    officesTitle: OUTCOME_COMMON_TEXTS[language].offices,
    offices: registrationOffices(language),
    mapLabel: OUTCOME_COMMON_TEXTS[language].map,
  };

  if (scene === 'retry') {
    return { ...base, ...offices, ...RETRY_FOOT_TEXTS[language], kind: 'retry' as const };
  }

  return { ...base, ...offices, kind: 'office' as const };
}

// --------------------------------------------------------------------------- каталог

/** Баланс в шапке каталога — состояние снимка макетов: 2 450. */
const CATALOG_BALANCE = 2450;

const CATALOG_TEXTS = {
  title: 'Каталог',
  back: BACK,
  change: 'Сменить',
  sale: 'SALE',
  decrease: 'Убрать одну',
  increase: 'Добавить',
  increaseMore: 'Добавить ещё',
  total: 'Сумма',
  remaining: 'Останется',
  checkout: 'Оформить',
  empty: 'Здесь появятся товары, которые можно взять за баллы в этом офисе. Сейчас их нет — загляните в другой офис.',
  error: 'Не удалось загрузить товары. Попробуйте ещё раз.',
  retry: RETRY,
};

/** Причины под погашенной «Оформить» — `catalog-showcase-states.html`, сцены 1 и 2. */
const CHECKOUT_NOTHING_SELECTED = 'Выберите товар, чтобы оформить заказ.';
const CHECKOUT_OVER_BALANCE = 'Сумма больше вашего баланса — уберите что-нибудь из заказа.';

/** Офисы каталога — имена из старой базы, адреса демонстрационные (`catalog.md`). */
const CATALOG_OFFICES: MemberCatalogOfficeView[] = [
  { id: 'kadysheva', name: 'Кадышева', address: 'ул. Кадышева, 4' },
  { id: 'sergeli', name: 'Сергели', address: 'Сергели, 6-й квартал, 21' },
  { id: 'ttz', name: 'ТТЗ', address: 'массив ТТЗ-1, 15' },
];

/** Офис витрины в снимке. */
export const CATALOG_CURRENT_OFFICE = 'kadysheva';

/**
 * Сцены витрины: `showcase` — `catalog-showcase.html`, `first` — `catalog-office-sheet-first.html`,
 * остальные — сцены 1–5 `catalog-showcase-states.html`. На листе состояний по два товара,
 * в сцене 3 у держателя в офисе две штуки.
 */
export type CatalogScene = 'first' | 'showcase' | 'nothing' | 'overBalance' | 'stockLimit' | 'empty' | 'error';

const CATALOG_SCENES: Record<
  CatalogScene,
  { state: 'pick' | 'ready' | 'empty' | 'error'; products: CatalogProduct[]; cart: CatalogCart }
> = {
  first: { state: 'pick', products: [], cart: {} },
  showcase: {
    state: 'ready',
    products: [POWER_BANK, HEADSET, CHECKER, FRESHENER, TIRE, MAGNET],
    cart: { [POWER_BANK.id]: 1, [FRESHENER.id]: 1 },
  },
  nothing: { state: 'ready', products: [POWER_BANK, HEADSET], cart: {} },
  overBalance: { state: 'ready', products: [POWER_BANK, HEADSET], cart: { [POWER_BANK.id]: 1, [HEADSET.id]: 1 } },
  stockLimit: { state: 'ready', products: [TIRE, { ...MAGNET, available: 2 }], cart: { [MAGNET.id]: 2 } },
  empty: { state: 'empty', products: [], cart: {} },
  error: { state: 'error', products: [], cart: {} },
};

/** Корзина, с которой сцена открывается. Дальше её держит страница. */
export function catalogInitialCart(scene: CatalogScene): CatalogCart {
  return { ...CATALOG_SCENES[scene].cart };
}

function catalogOffice(officeId: string): MemberCatalogOfficeView {
  return CATALOG_OFFICES.find((office) => office.id === officeId) ?? CATALOG_OFFICES[0]!;
}

function cartTotal(products: CatalogProduct[], cart: CatalogCart): number {
  return products.reduce((sum, product) => sum + product.points * (cart[product.id] ?? 0), 0);
}

/** Витрина сцены с корзиной страницы: итог, остаток и причина под кнопкой считаются из корзины. */
export function catalogShowcaseMock(scene: CatalogScene, cart: CatalogCart, officeId: string) {
  const setup = CATALOG_SCENES[scene];
  const total = cartTotal(setup.products, cart);
  const remaining = CATALOG_BALANCE - total;

  return {
    state: setup.state,
    balance: { label: 'Ваши баллы', amount: formatPoints(CATALOG_BALANCE) },
    office: { label: 'Офис', name: catalogOffice(officeId).name },
    products: setup.products.map((product) => productView(product, cart)),
    checkout: {
      total: formatPoints(total),
      remaining: formatPoints(remaining),
      remainingNegative: remaining < 0,
      disabled: total === 0 || remaining < 0,
      reason: total === 0 ? CHECKOUT_NOTHING_SELECTED : remaining < 0 ? CHECKOUT_OVER_BALANCE : undefined,
      reasonTone: remaining < 0 ? ('warn' as const) : ('quiet' as const),
    },
    texts: CATALOG_TEXTS,
  };
}

/** Шторка «Где заберёте товары?» — `catalog-office-sheet.html`. */
export const catalogOfficeSheetMock = {
  offices: CATALOG_OFFICES,
  texts: {
    title: 'Где заберёте товары?',
    subtitle: 'Выберите офис. В каждом свой набор, и заказ забирается там, где вы его оформили.',
    office: 'Офис',
    warning: 'Корзина очистится: в другом офисе свой набор',
    save: 'Сохранить',
    cancel: 'Отменить',
  },
};

/** Отказ оформления на листе `catalog-confirm-states.html`, сцена 2 — `order_denied_insufficient_stock`. */
export const CATALOG_ORDER_DENIED = '«Power Bank 20 000 mAh» осталось меньше, чем в заказе: доступно 0. Измените количество.';

/** Шторка «Проверьте заказ» — `catalog-confirm.html`: строки — то, что взято в корзину. */
export function catalogConfirmMock(scene: CatalogScene, cart: CatalogCart, officeId: string) {
  const setup = CATALOG_SCENES[scene];
  const office = catalogOffice(officeId);
  const lines: MemberCartLineView[] = setup.products
    .filter((product) => (cart[product.id] ?? 0) > 0)
    .map((product) => {
      const count = cart[product.id] ?? 0;

      return {
        id: product.id,
        title: product.name,
        image: product.image,
        price: formatPoints(product.points * count),
        count,
        quantity: `${count} шт.`,
        available: product.available,
      };
    });

  return {
    office: { label: 'Офис', name: office.name, address: office.address },
    lines,
    total: formatPoints(cartTotal(setup.products, cart)),
    texts: {
      title: 'Проверьте заказ',
      total: 'Сумма',
      note: 'Баллы спишутся сейчас. Они вернутся, если отменить заказ или не забрать его в течение суток.',
      place: 'Оформить заказ',
      cancel: 'Отменить',
      decrease: 'Убрать одну',
      increase: 'Добавить',
    },
  };
}
