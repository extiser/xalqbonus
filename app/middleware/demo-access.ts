import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { DEMO_EDITOR_ROLES } from '#shared/access';

/**
 * Раздел «Демо» — только владельцу (issue #252).
 *
 * Проверка дублирует серверную (`server/api/demo/*`) и ничего не решает: набранный руками
 * адрес закрывают ручки. Нужна она, чтобы человек, попавший сюда ссылкой, увидел свою работу,
 * а не череду отказов.
 */
export default defineNuxtRouteMiddleware(() => {
  const employee = useCurrentEmployee();

  if (employee.value !== null && !DEMO_EDITOR_ROLES.includes(employee.value.role)) {
    return navigateTo('/drivers');
  }
});
