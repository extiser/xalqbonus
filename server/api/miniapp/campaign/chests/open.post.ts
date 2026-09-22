import { openCampaignChest } from '#server/services/campaigns/openCampaignChest';
import type { CampaignChestRef } from '#server/services/points/idempotencyKey';
import { chestDenialCode, denyMemberChest } from '#server/utils/memberChestDenial';
import { requireMember } from '#server/utils/miniAppMember';
import type { MiniAppOpenChestRequestBody, MiniAppOpenChestResponse } from '#shared/types/miniapp';

/**
 * Открытие сундука акции (issue #181). Чей сундук — решает подпись, а не тело: человека
 * и акции в запросе нет, акция — та, что водителю сейчас видна.
 *
 * Заработан ли сундук, решает служба — от журнала, тем же счётом, что экран. Повтор открытия
 * отвечает той же наградой.
 */

const badRequest = (message: string) =>
  createError({ statusCode: 400, statusMessage: 'Bad Request', message });

/** Сундук из тела. Форму проверяем здесь; есть ли такой день в окне — служба. */
const readChest = (body: Partial<MiniAppOpenChestRequestBody> | null): CampaignChestRef | null => {
  switch (body?.kind) {
    case 'day':
      return typeof body.day === 'number' && Number.isInteger(body.day) && body.day >= 1
        ? { kind: 'day', dayNumber: body.day }
        : null;
    case 'three_days':
      return { kind: 'three_days' };
    case 'week':
      return { kind: 'week' };
    default:
      return null;
  }
};

export default defineEventHandler(async (event): Promise<MiniAppOpenChestResponse> => {
  const driver = await requireMember(event);
  const chest = readChest(await readBody<Partial<MiniAppOpenChestRequestBody> | null>(event));

  if (!chest) {
    throw badRequest('нужен сундук { kind: day | three_days | week, day } — день только у сундука дня');
  }

  try {
    return await openCampaignChest(driver, chest, new Date());
  } catch (error) {
    const code = chestDenialCode(error);

    if (code) {
      throw denyMemberChest(code, driver.language);
    }

    throw error;
  }
});
