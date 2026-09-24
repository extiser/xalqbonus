/**
 * Экраны и состояния служебной страницы `/design` — по строке на адрес `/design/{slug}`.
 *
 * Список один на оглавление и на страницу экрана: адрес, которого здесь нет, отвечает 404,
 * а не пустой колонкой.
 */
export interface DesignScreen {
  slug: string;
  title: string;
  /**
   * Откуда снято — файл макета. Регистрация, главная, разделы с шапкой, каталог и подарки — пути снимка
   * `_reference/design/`; профиль и акция — ещё пути планировочной папки (`product/design/`).
   */
  source: string;
}

export interface DesignGroup {
  title: string;
  screens: DesignScreen[];
}

export const DESIGN_GROUPS: DesignGroup[] = [
  {
    title: 'Регистрация и служебные экраны',
    screens: [
      { slug: 'app-loading', title: 'Загрузка — кнопкой внизу проверяется уход', source: 'registration/state-loading.html' },
      { slug: 'app-load-failed', title: 'Не удалось загрузить', source: 'registration/state-load-failed.html' },
      { slug: 'app-not-telegram', title: 'Открыто не из Telegram', source: 'registration/state-not-telegram.html' },
      { slug: 'app-outdated-telegram', title: 'Устаревший Telegram', source: 'registration/state-outdated-telegram.html' },
      { slug: 'registration-language', title: 'Шаг 1 — язык', source: 'registration/registration-language.html' },
      { slug: 'registration-phone', title: 'Шаг 2 — номер', source: 'registration/registration-screen.html' },
      { slug: 'registration-phone-checking', title: 'Шаг 2 — проверяем номер', source: 'registration/registration-screen.html' },
      { slug: 'registration-refused', title: 'Отказ «в офис» — person_already_linked', source: 'registration/registration-refused.html' },
      { slug: 'registration-retry', title: 'Повтор — проверка не прошла', source: 'registration/registration-retry.html' },
      { slug: 'registration-retry-checking', title: 'Повтор — проверяем номер', source: 'registration/registration-retry.html' },
      { slug: 'registration-employee', title: 'Отказ сотруднику', source: 'registration/registration-employee.html' },
      { slug: 'registration-employee-denied', title: 'Сотрудник с выключенной учёткой', source: 'registration/state-employee-denied.html' },
    ],
  },
  {
    title: 'Главный экран',
    screens: [
      { slug: 'home', title: 'Участник акции — эталон', source: 'home/main-screen.html, catalog/catalog-block.html' },
      { slug: 'home-invite', title: 'В снимке акции, не вступил — плашка приглашения', source: 'home/main-screen-invite.html' },
      { slug: 'home-several', title: 'Ждут несколько заказов и наград', source: 'home/orders-block.html, home/rewards-block.html' },
      { slug: 'home-quiet', title: 'Забирать нечего — последний заказ выдан, без акции', source: 'home/orders-block.html, home/rewards-block.html' },
      { slug: 'home-quiet-cancelled', title: 'Забирать нечего — последний заказ отменён', source: 'home/orders-block.html' },
      { slug: 'home-newcomer', title: 'Новичок — заказов, наград и истории не было, каталог пуст', source: 'home/orders-block.html, home/rewards-block.html, home/history-block.html, catalog/catalog-block.html' },
      { slug: 'home-loading', title: 'История грузится', source: 'home/history-block.html' },
      { slug: 'home-errors', title: 'Не загрузилось', source: 'home/*-block.html, catalog/catalog-block.html' },
    ],
  },
  {
    title: 'Подарки',
    screens: [
      { slug: 'gifts-home-one', title: 'Главная — один подарок первым в «Моих наградах»', source: 'gifts/main-screen-gift-sheet.html' },
      { slug: 'gifts-home', title: 'Главная — два подарка первыми в «Моих наградах»', source: 'gifts/main-screen-gift.html' },
      { slug: 'gifts-sheet-one', title: 'Шторка — один подарок', source: 'gifts/main-screen-gift-sheet.html' },
      { slug: 'gifts-sheet', title: 'Шторка — два подарка и «Забрать всё»', source: 'gifts/main-screen-gifts-sheet.html' },
      {
        slug: 'gifts-take',
        title: '«Забрать» — ожидание, лопание, ошибка у второй, «Забрать всё», уход шторки',
        source: 'gifts/main-screen-gifts-take.html',
      },
      { slug: 'gifts-rewards', title: '«Мои награды» — группа подарков сверху', source: 'gifts/rewards-screen-gift.html' },
    ],
  },
  {
    title: 'Каталог',
    screens: [
      { slug: 'catalog-first', title: 'Первый вход — шторка выбора офиса', source: 'catalog/catalog-office-sheet-first.html' },
      { slug: 'catalog', title: 'Витрина офиса', source: 'catalog/catalog-showcase.html' },
      { slug: 'catalog-nothing', title: 'Витрина 1: ничего не выбрано', source: 'catalog/catalog-showcase-states.html' },
      { slug: 'catalog-over-balance', title: 'Витрина 2: сумма больше баланса', source: 'catalog/catalog-showcase-states.html' },
      { slug: 'catalog-stock-limit', title: 'Витрина 3: взял всё, что есть', source: 'catalog/catalog-showcase-states.html' },
      { slug: 'catalog-empty', title: 'Витрина 4: в офисе нет товаров', source: 'catalog/catalog-showcase-states.html' },
      { slug: 'catalog-error', title: 'Витрина 5: не загрузилось', source: 'catalog/catalog-showcase-states.html' },
      { slug: 'catalog-office', title: 'Смена офиса — отмечен текущий', source: 'catalog/catalog-office-sheet.html' },
      { slug: 'catalog-office-other', title: 'Смена офиса — отмечен другой, в корзине товары', source: 'catalog/catalog-office-sheet.html' },
      { slug: 'catalog-confirm', title: 'Подтверждение заказа', source: 'catalog/catalog-confirm.html' },
      { slug: 'catalog-confirm-placing', title: 'Подтверждение — оформляется', source: 'catalog/catalog-confirm-states.html' },
      { slug: 'catalog-confirm-denied', title: 'Подтверждение — отказ', source: 'catalog/catalog-confirm-states.html' },
    ],
  },
  {
    title: 'История баллов',
    screens: [
      { slug: 'history', title: 'Страница 25 строк и «Показать ещё»', source: 'home/history-block.html, home/section-bar.md' },
      { slug: 'history-reasons', title: 'Все одиннадцать причин', source: 'home/history-block.html' },
      { slug: 'history-empty', title: 'Пусто — видом экрана', source: 'home/history-block.html, orders/orders-screen-empty.html' },
      { slug: 'history-error', title: 'Не загрузилось — видом экрана', source: 'home/history-block.html, orders/orders-screen-empty.html' },
      { slug: 'history-loading', title: 'Ждём ответа', source: 'home/history-block.html' },
    ],
  },
  {
    title: 'Мои награды',
    screens: [
      { slug: 'rewards', title: 'Ждут в офисе и история', source: 'orders/rewards-screen.html' },
      { slug: 'rewards-nopending', title: 'Ждущих нет — группа с нулём', source: 'orders/rewards-screen-nopending.html' },
      { slug: 'rewards-empty', title: 'Наград не было', source: 'orders/rewards-screen-empty.html' },
      { slug: 'rewards-error', title: 'Не загрузилось', source: 'orders/rewards-screen-empty.html' },
    ],
  },
  {
    title: 'Мои заказы',
    screens: [
      { slug: 'orders', title: 'Ждут выдачи и история', source: 'orders/orders-screen.html' },
      { slug: 'orders-nopending', title: 'Ждущих нет — группа с нулём', source: 'orders/orders-screen-nopending.html' },
      { slug: 'orders-empty', title: 'Заказов не было', source: 'orders/orders-screen-empty.html' },
      { slug: 'orders-error', title: 'Не загрузилось', source: 'orders/orders-screen-empty.html' },
    ],
  },
  {
    title: 'Экран заказа',
    screens: [
      { slug: 'order', title: 'Ждёт выдачи — код, офис, состав, отмена', source: 'orders/order-screen.html' },
      { slug: 'order-issued', title: 'Выдан', source: 'orders/order-screen-states.html' },
      { slug: 'order-cancelled', title: 'Отменён водителем', source: 'orders/order-screen-states.html' },
      { slug: 'order-expired', title: 'Не забран за сутки', source: 'orders/order-screen-states.html' },
    ],
  },
  {
    title: 'Экран награды',
    screens: [
      { slug: 'reward', title: 'Награда-товар — код, офис, зачёркнутая цена', source: 'orders/reward-screen.html' },
      { slug: 'reward-custom', title: 'Произвольная награда — значок подарка', source: 'orders/reward-screen-custom.html' },
      { slug: 'reward-issued', title: 'Получена', source: 'orders/reward-screen-states.html' },
      { slug: 'reward-expired', title: 'Срок вышел', source: 'orders/reward-screen-states.html' },
    ],
  },
  {
    title: 'Профиль',
    screens: [
      { slug: 'profile', title: 'Профиль — глазик, шторки сброса и языка', source: 'app/profile-screen.html, artboard/language-sheet.html' },
      { slug: 'profile-language', title: 'Открыта шторка языка', source: 'artboard/language-sheet.html' },
      { slug: 'profile-reset', title: 'Открыта шторка сброса', source: 'app/profile-screen.html' },
    ],
  },
  {
    title: 'Акция «Неделя возвращения»',
    screens: [{ slug: 'promo', title: 'Экран приглашения', source: 'comeback/02-promo-hero.html' }],
  },
  {
    title: 'Экран участника акции',
    screens: [
      { slug: 'campaign', title: 'Экран участника — снимок 4 октября', source: 'comeback/03-member-screen.html' },
      { slug: 'campaign-heat-1', title: 'Накал 1: Ноль поездок — холодно', source: 'comeback/03-member-heat-scale.html' },
      { slug: 'campaign-heat-2', title: 'Накал 2: Первая поездка — холодно', source: 'comeback/03-member-heat-scale.html' },
      { slug: 'campaign-heat-3', title: 'Накал 3: Две из пяти — гранат', source: 'comeback/03-member-heat-scale.html' },
      { slug: 'campaign-heat-4', title: 'Накал 4: Три из пяти — гранат', source: 'comeback/03-member-heat-scale.html' },
      { slug: 'campaign-heat-5', title: 'Накал 5: Четыре из пяти — огонь', source: 'comeback/03-member-heat-scale.html' },
      { slug: 'campaign-heat-6', title: 'Накал 6: Цель взята — огонь, конфетти и «Открыть сундук»', source: 'comeback/03-member-heat-scale.html' },
      { slug: 'campaign-week-1', title: 'Неделя 1: Первый день окна', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-week-2', title: 'Неделя 2: Неделя идёт, запас есть', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-week-3', title: 'Неделя 3: Запас кончился', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-week-4', title: 'Неделя 4: Последний день', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-week-5', title: 'Неделя 5: Неделя собрана, окно ещё идёт', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-week-6', title: 'Неделя 6: Пять дней уже не набрать', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-week-7', title: 'Неделя 7: Сегодня цель уже взята', source: 'comeback/03-member-week-states.html' },
      { slug: 'campaign-chests-1', title: 'Сундуки 1: Окно началось, поездок нет', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-2', title: 'Сундуки 2: Один день взят', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-3', title: 'Сундуки 3: Два дня, ступень близко', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-4', title: 'Сундуки 4: Три дня — сундук трёх дней можно открыть', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-5', title: 'Сундуки 5: Сундук трёх дней открыт', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-6', title: 'Сундуки 6: Пять дней — неделя собрана', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-7', title: 'Сундуки 7: Семь дней — всё окно', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-8', title: 'Сундуки 8: Пять дней уже не набрать', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-9', title: 'Сундуки 9: Итог: дошёл до трёх дней', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-10', title: 'Сундуки 10: Неделя подведена, большой ждёт открытия', source: 'comeback/03-member-chests-states.html' },
      { slug: 'campaign-chests-11', title: 'Сундуки 11: Всё открыто — акция закрыта', source: 'comeback/03-member-chests-states.html' },
    ],
  },
  {
    title: 'Шторка «Сундуки дня»',
    screens: [
      { slug: 'day-chests', title: 'Эталон — открытие сундука с вылетом награды', source: 'comeback/04-day-chests-sheet.html' },
      { slug: 'day-chests-1', title: 'Сцена 1: День 1, первый заход', source: 'comeback/04-day-chests-sheet-states.html' },
      { slug: 'day-chests-2', title: 'Сцена 2: Середина окна — эталон, нажмите золотой сундук', source: 'comeback/04-day-chests-sheet-states.html' },
      { slug: 'day-chests-3', title: 'Сцена 3: Сегодня цель взята', source: 'comeback/04-day-chests-sheet-states.html' },
      { slug: 'day-chests-4', title: 'Сцена 4: Семь из семи', source: 'comeback/04-day-chests-sheet-states.html' },
      { slug: 'day-chests-5', title: 'Сцена 5: Окно кончилось, неоткрытые остались', source: 'comeback/04-day-chests-sheet-states.html' },
      { slug: 'day-chests-6', title: 'Сцена 6: Сундуки вскрыты за водителя', source: 'comeback/04-day-chests-sheet-states.html' },
      { slug: 'reward-tickets', title: 'Карточки награды — четыре ступени', source: 'comeback/06-reward-card-sketch.html' },
    ],
  },
  {
    title: 'Шторка «Сундук трёх дней»',
    screens: [
      { slug: 'big-chest-3days', title: 'Эталон — заработан, открытие с вылетом награды', source: 'comeback/05-3days-chest-sheet.html' },
      { slug: 'big-chest-3days-1', title: 'Сцена 1: Окно началось, дней нет — тап отказывает', source: 'comeback/05-3days-chest-states.html' },
      { slug: 'big-chest-3days-2', title: 'Сцена 2: Один день взят', source: 'comeback/05-3days-chest-states.html' },
      { slug: 'big-chest-3days-3', title: 'Сцена 3: До сундука один день', source: 'comeback/05-3days-chest-states.html' },
      { slug: 'big-chest-3days-4', title: 'Сцена 4: Сундук заработан — нажмите, чтобы открыть', source: 'comeback/05-3days-chest-states.html' },
      { slug: 'big-chest-3days-5', title: 'Сцена 5: Открыт', source: 'comeback/05-3days-chest-states.html' },
      { slug: 'big-chest-3days-6', title: 'Сцена 6: Окно кончилось — упущен', source: 'comeback/05-3days-chest-states.html' },
    ],
  },
  {
    title: 'Шторка «Сундук недели»',
    screens: [
      { slug: 'big-chest-week', title: 'Эталон — заработан, открытие с вылетом награды', source: 'comeback/05-week-chest-sheet.html' },
      { slug: 'big-chest-week-1', title: 'Сцена 1: Окно началось, дней нет — тап отказывает', source: 'comeback/05-week-chest-states.html' },
      { slug: 'big-chest-week-2', title: 'Сцена 2: Один день взят', source: 'comeback/05-week-chest-states.html' },
      { slug: 'big-chest-week-3', title: 'Сцена 3: До сундука один день', source: 'comeback/05-week-chest-states.html' },
      { slug: 'big-chest-week-4', title: 'Сцена 4: Сундук заработан — нажмите, чтобы открыть', source: 'comeback/05-week-chest-states.html' },
      { slug: 'big-chest-week-5', title: 'Сцена 5: Открыт', source: 'comeback/05-week-chest-states.html' },
      { slug: 'big-chest-week-6', title: 'Сцена 6: Окно кончилось — упущен', source: 'comeback/05-week-chest-states.html' },
    ],
  },
];

export function findDesignScreen(slug: string): DesignScreen | undefined {
  return DESIGN_GROUPS.flatMap((group) => group.screens).find((screen) => screen.slug === slug);
}
