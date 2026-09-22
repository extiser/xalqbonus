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
];

export function findDesignScreen(slug: string): DesignScreen | undefined {
  return DESIGN_GROUPS.flatMap((group) => group.screens).find((screen) => screen.slug === slug);
}
