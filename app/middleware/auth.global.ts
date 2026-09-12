import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { failureDenial } from '~/utils/requestError';
import type { ServerDenialCode } from '#shared/denials';
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
 * возвращается. Тем же адресом уезжает и причина отказа — вторым параметром.
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

    // Причина отказа едет адресом, а не состоянием в памяти. На клиенте это переход внутри
    // приложения, и память доезжает; на холодной загрузке `navigateTo` на другой путь —
    // это `302`, браузер идёт за `/login` вторым запросом, и всё, что записано первым,
    // до формы не доживает. Адрес переживает оба пути, и пути становятся одним.
    //
    // Едет код, а не текст: параметр в адресе пишет кто угодно, поэтому форма его
    // проверяет и берёт текст сама — из общего словаря (`shared/denials.ts`).
    //
    // Объяснение нужно каждому отказу, кроме «не представился»: тому, кто просто не вошёл,
    // форма входа и есть ответ, а выключенная учётка и погашенная сессия без объяснения
    // превращаются в верный пароль, который почему-то не пускает.
    //
    // Решение принимается по коду, а не по номеру ответа: под `401` исходов несколько,
    // и сказать человеку они должны разное.
    const query: { next: string; denied?: ServerDenialCode } =
      denial !== null && denial !== 'no_credentials'
        ? { next: to.fullPath, denied: denial }
        : { next: to.fullPath };

    return navigateTo({ path: LOGIN_PATH, query });
  }
});
