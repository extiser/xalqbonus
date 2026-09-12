import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { SYNC_ROLES } from '#shared/access';

/**
 * Экран наблюдаемости синхронизации — не для менеджера.
 *
 * Проверка здесь дублирует серверную (`server/api/sync/*`) и ничего не решает: набранный
 * руками адрес закрывают ручки, а не эта строка. Нужна она ради того, чтобы человек,
 * попавший сюда ссылкой из переписки, увидел свою работу, а не четыре отказа подряд.
 */
export default defineNuxtRouteMiddleware(() => {
  const employee = useCurrentEmployee();

  if (employee.value !== null && !SYNC_ROLES.includes(employee.value.role)) {
    return navigateTo('/drivers');
  }
});
