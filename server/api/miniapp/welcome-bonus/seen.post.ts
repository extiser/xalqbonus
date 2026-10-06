// `createError` берётся из `h3` явно — см. `server/utils/denial.ts`: у обёртки Nuxt номер
// ответа необязателен, а отказ без номера не отказ.
import { createError } from 'h3';

import { plainText } from '#server/bot/texts';
import { WelcomeBonusNotAwardedError } from '#server/services/points/errors';
import { markWelcomeBonusSeen } from '#server/services/points/markWelcomeBonusSeen';
import { requireMember } from '#server/utils/miniAppMember';
import type { MemberWelcomeDenialPayload } from '#shared/types/miniapp';

/**
 * «Спасибо» на слайде «Ура! Бонус зачислен!» (issue #421): слайд больше не показывается.
 * Тела нет — человек из подписи. Ответ пустой, `204`; повторное нажатие отметку не сдвигает.
 *
 * Бонус ещё не выдан — `409` с кодом `welcome_not_awarded`: отмечать праздник, которого
 * не было, нельзя.
 */
export default defineEventHandler(async (event): Promise<null> => {
  const driver = await requireMember(event);

  try {
    await markWelcomeBonusSeen(driver.personId, new Date());
  } catch (error) {
    if (error instanceof WelcomeBonusNotAwardedError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: plainText('welcome_denied_not_awarded', driver.language),
        data: { code: 'welcome_not_awarded' } satisfies MemberWelcomeDenialPayload,
      });
    }

    throw error;
  }

  setResponseStatus(event, 204);

  return null;
});
