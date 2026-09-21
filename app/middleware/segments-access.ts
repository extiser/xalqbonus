import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { SEGMENT_ROLES } from '#shared/access';

/**
 * Сегменты — не для менеджера.
 *
 * Проверка здесь дублирует серверную (`server/api/segments/*`) и ничего не решает: набранный
 * руками адрес закрывают ручки, а не эта строка. Нужна она ради того, чтобы человек,
 * попавший сюда ссылкой из переписки, увидел свою работу, а не череду отказов.
 */
export default defineNuxtRouteMiddleware(() => {
  const employee = useCurrentEmployee();

  if (employee.value !== null && !SEGMENT_ROLES.includes(employee.value.role)) {
    return navigateTo('/drivers');
  }
});
