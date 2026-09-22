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
];

export function findDesignScreen(slug: string): DesignScreen | undefined {
  return DESIGN_GROUPS.flatMap((group) => group.screens).find((screen) => screen.slug === slug);
}
