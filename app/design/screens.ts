/**
 * Экраны и состояния служебной страницы `/design` — по строке на адрес `/design/{slug}`.
 *
 * Список один на оглавление и на страницу экрана: адрес, которого здесь нет, отвечает 404,
 * а не пустой колонкой.
 */
export interface DesignScreen {
  slug: string;
  title: string;
  /** Откуда снято — файл макета в `product/design/`. */
  source: string;
}

export interface DesignGroup {
  title: string;
  screens: DesignScreen[];
}

export const DESIGN_GROUPS: DesignGroup[] = [
  {
    title: 'Главный экран',
    screens: [
      { slug: 'home', title: 'Участник акции — эталон', source: 'app/main-screen.html' },
      { slug: 'home-invite', title: 'В снимке акции, не вступил — плашка приглашения', source: 'app/main-screen-invite.html' },
      { slug: 'home-several', title: 'Ждут несколько заказов и наград', source: 'artboard/orders-block.html, rewards-block.html' },
      { slug: 'home-quiet', title: 'Забирать нечего', source: 'artboard/orders-block.html, rewards-block.html' },
      { slug: 'home-newcomer', title: 'Новичок — пусто', source: 'artboard/history-block.html' },
      { slug: 'home-loading', title: 'История грузится', source: 'artboard/history-block.html' },
      { slug: 'home-errors', title: 'Не загрузилось', source: 'artboard/*-block.html' },
    ],
  },
  {
    title: 'История баллов',
    screens: [
      { slug: 'history', title: 'Страница 25 строк и «Показать ещё»', source: 'app/history-screen.html' },
      { slug: 'history-reasons', title: 'Все одиннадцать причин', source: 'artboard/history-block.html' },
      { slug: 'history-empty', title: 'Пусто', source: 'artboard/history-block.html' },
      { slug: 'history-error', title: 'Не загрузилось', source: 'artboard/history-block.html' },
      { slug: 'history-loading', title: 'Ждём ответа', source: 'artboard/history-block.html' },
    ],
  },
  {
    title: 'Мои награды',
    screens: [
      { slug: 'rewards', title: 'Ждут в офисе и история', source: 'app/rewards-screen.html' },
      { slug: 'rewards-nothing', title: 'Ждущих нет — только история', source: 'app/rewards-screen.md' },
      { slug: 'rewards-empty', title: 'Наград не было', source: 'artboard/rewards-block.html' },
      { slug: 'rewards-error', title: 'Не загрузилось', source: 'artboard/rewards-block.html' },
    ],
  },
  {
    title: 'Мои заказы',
    screens: [
      { slug: 'orders', title: 'Ждут выдачи и история', source: 'app/orders-screen.html' },
      { slug: 'orders-empty', title: 'Заказов не было', source: 'server/bot/texts.ts → orders_empty' },
      { slug: 'orders-error', title: 'Не загрузилось', source: 'artboard/orders-block.html' },
    ],
  },
  {
    title: 'Экран заказа',
    screens: [
      { slug: 'order', title: 'Ждёт выдачи — код, офис, состав, отмена', source: 'app/order-screen.html' },
      { slug: 'order-issued', title: 'Выдан', source: 'app/order-screen-states.html' },
      { slug: 'order-cancelled', title: 'Отменён водителем', source: 'app/order-screen-states.html' },
      { slug: 'order-expired', title: 'Не забран за сутки', source: 'app/order-screen-states.html' },
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
];

export function findDesignScreen(slug: string): DesignScreen | undefined {
  return DESIGN_GROUPS.flatMap((group) => group.screens).find((screen) => screen.slug === slug);
}
