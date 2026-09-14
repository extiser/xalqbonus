import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { STAFF_ROLES } from '#shared/access';

/**
 * Экран сотрудников — не для менеджера.
 *
 * Проверка здесь дублирует серверную (`server/api/employees/*`, `server/api/employee-invites/*`)
 * и ничего не решает: набранный руками адрес закрывают ручки, а не эта строка. Нужна она
 * ради того, чтобы человек, попавший сюда ссылкой из переписки, увидел свою работу,
 * а не череду отказов.
 */
export default defineNuxtRouteMiddleware(() => {
  const employee = useCurrentEmployee();

  if (employee.value !== null && !STAFF_ROLES.includes(employee.value.role)) {
    return navigateTo('/drivers');
  }
});
