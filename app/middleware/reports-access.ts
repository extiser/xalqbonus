import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { REPORT_ROLES } from '#shared/access';

/**
 * Отчёты — не для менеджера (issue #308).
 *
 * Проверка здесь дублирует серверную (`server/api/reports/*`) и ничего не решает: набранный
 * руками адрес закрывают ручки, а не эта строка. Нужна она ради того, чтобы человек, попавший
 * сюда ссылкой из переписки, увидел свою работу, а не череду отказов.
 */
export default defineNuxtRouteMiddleware(() => {
  const employee = useCurrentEmployee();

  if (employee.value !== null && !REPORT_ROLES.includes(employee.value.role)) {
    return navigateTo('/drivers');
  }
});
