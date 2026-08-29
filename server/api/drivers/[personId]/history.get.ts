import {
  DEFAULT_HISTORY_LIMIT,
  readDriverHistory,
} from '#server/services/drivers/readDriverHistory';
import { readPositiveInteger, readUuid } from '#server/utils/query';
import type { DriverHistoryResponse } from '#shared/types/driver';

// История операций по счёту водителя, страницей. Отдельной ручкой от карточки намеренно:
// карточка читается один раз, а история листается, и пересчитывать сверку с журналом
// на каждом перелистывании незачем.
export default defineEventHandler((event): Promise<DriverHistoryResponse> => {
  const personId = readUuid(getRouterParam(event, 'personId'));

  if (!personId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'идентификатор человека не похож на uuid',
    });
  }

  const query = getQuery(event);

  return readDriverHistory({
    personId,
    limit: readPositiveInteger(query.limit, DEFAULT_HISTORY_LIMIT),
    offset: readPositiveInteger(query.offset, 0),
  });
});
