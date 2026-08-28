/**
 * Пункты навигации служебной части.
 *
 * Список, а не одна ссылка: следующим по этому же каркасу идёт карточка водителя
 * (issue `driver-card`), и пункт «Водитель» появится здесь строкой. До тех пор он
 * не рисуется — пункт, ведущий в никуда, хуже его отсутствия.
 */
export type NavigationItem = {
  title: string;
  path: string;
};

export const SERVICE_NAVIGATION: NavigationItem[] = [{ title: 'Синхронизация', path: '/sync' }];
