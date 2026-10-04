import type { Component } from 'vue';
import {
  PhArrowsClockwise,
  PhChartBar,
  PhFunnel,
  PhGift,
  PhIdentificationCard,
  PhMegaphone,
  PhPackage,
  PhPaperPlaneTilt,
  PhPresentation,
  PhQrCode,
  PhShoppingBag,
  PhSquaresFour,
  PhStorefront,
  PhUsers,
} from '@phosphor-icons/vue';
import {
  ALL_EMPLOYEE_ROLES,
  CAMPAIGN_ROLES,
  CATALOG_ROLES,
  DEMO_EDITOR_ROLES,
  MAILING_ROLES,
  METRICS_ROLES,
  ORDER_ROLES,
  PROMO_ROLES,
  REPORT_ROLES,
  REWARD_GRANT_ROLES,
  SEGMENT_ROLES,
  STAFF_ROLES,
  SYNC_ROLES,
} from '#shared/access';
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
 *
 * Значок — свойство пункта, а не разметка меню (`_reference/design/web/icons-compare.md`):
 * меню веба рисует его, шапка светлой раскладки — нет. Набор — Phosphor, импорт поимённый,
 * чтобы сборка брала только используемые (`docs/decisions.md` → «Веб в стиле бенто»).
 */
export type NavigationItem = {
  title: string;
  path: string;
  icon: Component;
  roles: readonly EmployeeIdentity['role'][];
};

const SERVICE_NAVIGATION: NavigationItem[] = [
  // Первым: дашборд — первый экран владельца (issue #371). Вкладки
  // `/dashboard/levers` и `/dashboard/depth` подсвечивают этот же пункт — они вложены в его адрес.
  { title: 'Дашборд', path: '/dashboard', icon: PhSquaresFour, roles: METRICS_ROLES },
  { title: 'Водители', path: '/drivers', icon: PhUsers, roles: ALL_EMPLOYEE_ROLES },
  { title: 'Заказы', path: '/orders', icon: PhShoppingBag, roles: ORDER_ROLES },
  { title: 'Офисы', path: '/offices', icon: PhStorefront, roles: CATALOG_ROLES },
  // Раздел называется «Каталог», а адрес — по сущности, которой он управляет: страница
  // и ручка под ней читаются одним словом (`/products` ↔ `/api/products`), как у водителей.
  { title: 'Каталог', path: '/products', icon: PhPackage, roles: CATALOG_ROLES },
  // Продажи, остатки и дальше — другие отчёты по товару; выгрузка в Excel там же (issue #308).
  { title: 'Отчёты', path: '/reports', icon: PhChartBar, roles: REPORT_ROLES },
  // Вручение наград и подарков — одному водителю и сегменту, со списком раздач (issue #219).
  { title: 'Награды', path: '/rewards', icon: PhGift, roles: REWARD_GRANT_ROLES },
  // Свой раздел, а не блок у водителей: экран водителей — поиск человека, а срез парка —
  // другая работа, и следом за ним идёт рассылка (issue #165).
  { title: 'Сегменты', path: '/segments', icon: PhFunnel, roles: SEGMENT_ROLES },
  { title: 'Рассылки', path: '/mailings', icon: PhPaperPlaneTilt, roles: MAILING_ROLES },
  { title: 'Акции', path: '/campaigns', icon: PhMegaphone, roles: CAMPAIGN_ROLES },
  // Ссылки в бота с меткой и QR для носителей, с воронкой переходов (issue #380). Рядом
  // с акциями: и то и другое — привлечение водителей в программу.
  { title: 'Промо', path: '/promo', icon: PhQrCode, roles: PROMO_ROLES },
  { title: 'Сотрудники', path: '/employees', icon: PhIdentificationCard, roles: STAFF_ROLES },
  { title: 'Синхронизация', path: '/sync', icon: PhArrowsClockwise, roles: SYNC_ROLES },
  // Пульт демо — зрители, демо-водители, генератор, демо-менеджер (issue #252). Последним:
  // это не работа парка, а витрина, которую показывает владелец.
  { title: 'Демо', path: '/demo', icon: PhPresentation, roles: DEMO_EDITOR_ROLES },
];

/** Что показать этой роли. Не вошедшему — ничего: переходить ему некуда. */
export const navigationFor = (role: EmployeeIdentity['role'] | null): NavigationItem[] =>
  role === null ? [] : SERVICE_NAVIGATION.filter((item) => item.roles.includes(role));

/**
 * Пункт считается текущим и на вложенных страницах: карточка водителя живёт по адресу
 * `/drivers/<id>`, и меню, гаснущее при переходе в неё, теряет ответ на вопрос «где я сейчас».
 *
 * Одно правило на шапку светлой раскладки и меню веба: раздел, переехавший на новую раскладку,
 * подсвечивается так же, как подсвечивался в старой.
 */
export const isCurrentPath = (currentPath: string, itemPath: string): boolean =>
  currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
