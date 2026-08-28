import { countUnresolvedSkips, listUnresolvedSkips } from '#server/repositories/syncSkips';
import type { SyncSkipsResponse } from '#shared/types/sync';

/**
 * Страница нерешённого пропущенного — того, что синхронизация не смогла записать
 * и не записала до сих пор.
 *
 * Решённое сюда не попадает: список обязан таять после того, как реестр догнали, иначе
 * вопрос «что потеряно» подменяется вопросом «что когда-либо пропускалось», и ответ
 * на первый перестаёт существовать.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type SyncSkipsPageRequest = {
  limit: number;
  offset: number;
};

export const readSyncSkipsPage = async (
  request: SyncSkipsPageRequest,
): Promise<SyncSkipsResponse> => {
  const limit = Math.min(Math.max(request.limit, 1), MAX_LIMIT);
  const offset = Math.max(request.offset, 0);

  const [skips, total] = await Promise.all([
    listUnresolvedSkips(limit, offset),
    countUnresolvedSkips(),
  ]);

  return {
    skips: skips.map((skip) => ({
      reason: skip.reason,
      reference: skip.reference,
      detail: skip.detail,
      timesSeen: skip.timesSeen,
      firstSeenAt: skip.firstSeenAt.toISOString(),
      lastSeenAt: skip.lastSeenAt.toISOString(),
    })),
    total,
    limit,
    offset,
  };
};

export { DEFAULT_LIMIT as DEFAULT_SKIPS_LIMIT };
