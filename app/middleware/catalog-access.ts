import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { CATALOG_ROLES } from '#shared/access';

/**
 * Офисы и каталог — не для менеджера.
 *
 * Проверка здесь дублирует серверную (`server/api/offices/*`, `server/api/products/*`)
 * и ничего не решает: набранный руками адрес закрывают ручки, а не эта строка. Нужна она
 * ради того, чтобы человек, попавший сюда ссылкой из переписки, увидел свою работу,
 * а не череду отказов.
 */
export default defineNuxtRouteMiddleware(() => {
  const employee = useCurrentEmployee();

  if (employee.value !== null && !CATALOG_ROLES.includes(employee.value.role)) {
    return navigateTo('/drivers');
  }
});
