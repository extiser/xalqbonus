import { ALL_EMPLOYEE_ROLES, CATALOG_ROLES, SYNC_ROLES } from '#shared/access';
import type { EmployeeIdentity } from '#shared/types/employee';

/**
 * Пункты навигации служебной части.
 *
 * Пункт появляется здесь вместе со своим экраном и не раньше: ссылка, ведущая в никуда,
 * хуже её отсутствия.
 *
 * У каждого пункта записано, чьим ролям он открыт, и списки те же, по которым отказывают
 * ручки (`shared/access.ts`). Прячет шапка пункт не ради защиты — защищает сервер, —
 * а ради того, чтобы человек не выбирал из того, что ему откажут.
 */
export type NavigationItem = {
  title: string;
  path: string;
  roles: readonly EmployeeIdentity['role'][];
};

const SERVICE_NAVIGATION: NavigationItem[] = [
  { title: 'Водители', path: '/drivers', roles: ALL_EMPLOYEE_ROLES },
  { title: 'Офисы', path: '/offices', roles: CATALOG_ROLES },
  // Раздел называется «Каталог», а адрес — по сущности, которой он управляет: страница
  // и ручка под ней читаются одним словом (`/products` ↔ `/api/products`), как у водителей.
  { title: 'Каталог', path: '/products', roles: CATALOG_ROLES },
  { title: 'Синхронизация', path: '/sync', roles: SYNC_ROLES },
];

/** Что показать этой роли. Не вошедшему — ничего: переходить ему некуда. */
export const navigationFor = (role: EmployeeIdentity['role'] | null): NavigationItem[] =>
  role === null ? [] : SERVICE_NAVIGATION.filter((item) => item.roles.includes(role));
