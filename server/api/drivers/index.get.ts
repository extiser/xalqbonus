import { DEFAULT_SEARCH_LIMIT, searchDrivers } from '#server/services/drivers/searchDrivers';
import { requireEmployee } from '#server/utils/employeeAuth';
import { readPositiveInteger } from '#server/utils/query';
import type { DriverSearchResponse } from '#shared/types/driver';

// Поиск водителя по всему реестру парка — по номеру ВУ, телефону и имени сразу. Только
// чтение: ручек, меняющих данные, на этом экране нет ни одной (issue #35).
//
// Открыта всем трём ролям: найти человека и посмотреть его баланс — ежедневная работа
// и менеджера тоже. Только чтение доступ не отменяет: здесь телефоны четырёх тысяч
// водителей, и без сессии этот список не отдаётся никому.
export default defineEventHandler(async (event): Promise<DriverSearchResponse> => {
  await requireEmployee(event);

  const query = getQuery(event);

  return searchDrivers({
    query: typeof query.query === 'string' ? query.query : '',
    limit: readPositiveInteger(query.limit, DEFAULT_SEARCH_LIMIT),
    offset: readPositiveInteger(query.offset, 0),
  });
});
