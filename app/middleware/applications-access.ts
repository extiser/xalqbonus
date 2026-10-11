import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { APPLICATION_ROLES } from '#shared/access';

/**
 * Раздел «Заявки» — всем ролям сотрудников (issue #471).
 *
 * Проверка дублирует серверную (`server/api/applications/*`) и ничего не решает: набранный
 * руками адрес закрывают ручки. Нужна она, чтобы человек, попавший сюда ссылкой из переписки,
 * увидел свою работу, а не череду отказов. Демо-сотрудник в веб не входит вовсе.
 */
export default defineNuxtRouteMiddleware(() => {
  const employee = useCurrentEmployee();

  if (employee.value !== null && !APPLICATION_ROLES.includes(employee.value.role)) {
    return navigateTo('/drivers');
  }
});
