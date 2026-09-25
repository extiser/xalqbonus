import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { REWARD_GRANT_ROLES } from '#shared/access';

/**
 * Раздел «Награды» — тем, кому открыта выдача наград (issue #219).
 *
 * Проверка здесь дублирует серверную (`server/api/gifts/*`) и ничего не решает: набранный
 * руками адрес закрывают ручки, а не эта строка. Нужна она ради того, чтобы человек,
 * попавший сюда ссылкой из переписки, увидел свою работу, а не череду отказов.
 */
export default defineNuxtRouteMiddleware(() => {
  const employee = useCurrentEmployee();

  if (employee.value !== null && !REWARD_GRANT_ROLES.includes(employee.value.role)) {
    return navigateTo('/drivers');
  }
});
