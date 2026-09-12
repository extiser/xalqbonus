import { useAccessNotice, useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { failureDenial, failureText } from '~/utils/requestError';
import type { EmployeeMeResponse } from '#shared/types/employee';

/**
 * Незалогиненного ведём на вход, а не на пустой экран.
 *
 * Это навигация страниц, а не проверка доступа: данные закрывает каждая ручка сама
 * (`server/utils/employeeAuth.ts`), и здесь решается ровно один вопрос — что человеку
 * показать. Пройти мимо этой проверки нельзя ничего: адрес, открытый без сессии, вернёт
 * из ручки 401 и без всякого перенаправления.
 *
 * После удачного входа человек попадает туда, куда шёл: адрес уезжает в `next` и оттуда же
 * возвращается.
 */

const LOGIN_PATH = '/login';

/** Mini App водителя: своя дверь и своя личность — подписанная `initData`, а не cookie. */
const MINIAPP_PATH = '/app';

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === LOGIN_PATH || to.path === MINIAPP_PATH || to.path.startsWith(`${MINIAPP_PATH}/`)) {
    return;
  }

  const employee = useCurrentEmployee();

  if (employee.value !== null) {
    return;
  }

  // `useRequestFetch`, а не `$fetch`: при отрисовке на сервере обычный запрос уходит
  // без cookie браузера, и вошедший сотрудник увидел бы форму входа на каждой загрузке.
  const request = useRequestFetch();

  try {
    employee.value = (await request<EmployeeMeResponse>('/api/auth/me')).employee;

    return;
  } catch (error) {
    const denial = failureDenial(error);

    // Объяснение нужно каждому отказу, кроме «не представился»: тому, кто просто не вошёл,
    // форма входа и есть ответ, а выключенная учётка, погашенная сессия и нехватка роли
    // без объяснения превращаются в верный пароль, который почему-то не пускает.
    //
    // Решение принимается по коду, а не по номеру ответа: под `401` исходов несколько,
    // и сказать человеку они должны разное (`shared/denials.ts`).
    if (denial !== null && denial !== 'no_credentials') {
      useAccessNotice().value = failureText(error);
    }

    return navigateTo({ path: LOGIN_PATH, query: { next: to.fullPath } });
  }
});
