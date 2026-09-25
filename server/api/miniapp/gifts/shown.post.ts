import { markGiftsShown } from '#server/services/gifts/markGiftsShown';
import { requireMember } from '#server/utils/miniAppMember';
import { readUuid } from '#server/utils/query';
import type { MiniAppGiftsShownBody } from '#shared/types/rewards';

/**
 * Отметка «шторку с подарками видел» (issue #219). Ставится только своим подаркам: человек —
 * из подписи, чужие и испорченные идентификаторы молча пропускаются. Ответ пустой, `204`.
 */

/** Предел от испорченного запроса: подарков у водителя единицы. */
const REWARD_IDS_LIMIT = 100;

export default defineEventHandler(async (event): Promise<null> => {
  const driver = await requireMember(event);
  const body = await readBody<Partial<MiniAppGiftsShownBody> | null>(event);

  if (!Array.isArray(body?.rewardIds) || body.rewardIds.length > REWARD_IDS_LIMIT) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: `нужен список rewardIds — не больше ${REWARD_IDS_LIMIT}`,
    });
  }

  const rewardIds = body.rewardIds
    .map((value) => readUuid(value))
    .filter((value): value is string => value !== null);

  await markGiftsShown(driver.personId, rewardIds);

  setResponseStatus(event, 204);

  return null;
});
