import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { PROMO_ROLES } from '#shared/access';

/**
 * Раздел «Промо» — владельцу и админу (issue #380).
 *
 * Проверка здесь дублирует серверную (`server/api/promo/*`) и ничего не решает: набранный
 * руками адрес закрывают ручки, а не эта строка. Нужна она ради того, чтобы человек, попавший
 * сюда ссылкой из переписки, увидел свою работу, а не череду отказов.
 */
export default defineNuxtRouteMiddleware(() => {
  const employee = useCurrentEmployee();

  if (employee.value !== null && !PROMO_ROLES.includes(employee.value.role)) {
    return navigateTo('/drivers');
  }
});
