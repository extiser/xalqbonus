import { DEFAULT_SEARCH_LIMIT, searchDrivers } from '#server/services/drivers/searchDrivers';
import { readPositiveInteger } from '#server/utils/query';
import type { DriverSearchResponse } from '#shared/types/driver';

// Поиск водителя по всему реестру парка — по номеру ВУ, телефону и имени сразу. Только
// чтение: ручек, меняющих данные, на этом экране нет ни одной (issue #35).
export default defineEventHandler((event): Promise<DriverSearchResponse> => {
  const query = getQuery(event);

  return searchDrivers({
    query: typeof query.query === 'string' ? query.query : '',
    limit: readPositiveInteger(query.limit, DEFAULT_SEARCH_LIMIT),
    offset: readPositiveInteger(query.offset, 0),
  });
});
