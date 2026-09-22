import {
  DEFAULT_OFFICE_FEED_LIMIT,
  readOfficeFeed,
} from '#server/services/offices/readOfficeFeed';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readPositiveInteger, requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { OfficeFeedResponse } from '#shared/types/catalog';

// Лента офиса (issue #175): движения остатков и события произвольных наград по времени.
// Заменила ручку журнала движений: отдавать из `stock-movements` строки без движения значило
// бы, что имя ручки врёт про её ответ.
//
// Существование офиса здесь не проверяется отдельным запросом: пустая лента у офиса, которого
// нет, и у офиса без событий выглядит одинаково, а лента открывается только с карточки
// офиса — она и отвечает `404`.
export default defineEventHandler(async (event): Promise<OfficeFeedResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const officeId = requireUuidParam(event, 'officeId');
  const query = getQuery(event);

  return readOfficeFeed(
    officeId,
    readPositiveInteger(query.limit, DEFAULT_OFFICE_FEED_LIMIT),
    readPositiveInteger(query.offset, 0),
  );
});
