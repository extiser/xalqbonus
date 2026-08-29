/**
 * Пункты навигации служебной части.
 *
 * Пункт появляется здесь вместе со своим экраном и не раньше: ссылка, ведущая в никуда,
 * хуже её отсутствия.
 */
export type NavigationItem = {
  title: string;
  path: string;
};

export const SERVICE_NAVIGATION: NavigationItem[] = [
  { title: 'Синхронизация', path: '/sync' },
  { title: 'Водители', path: '/drivers' },
];
