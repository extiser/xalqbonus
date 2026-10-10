import { generatePromoCode } from '#server/services/promo/generatePromoCode';
import { readPromoLinkUrls } from '#server/services/promo/promoLinkUrl';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rejectPromoFailure } from '#server/utils/promoFailure';
import { PROMO_ROLES } from '#shared/access';
import type { PromoNewCode } from '#shared/types/promo';

// Свободный код для окна «Новая метка» и обе ссылки с ним (issue #380): в чат бота и в Mini App —
// у рекламы в Telegram (issue #456). Ничего не сохраняет: окно можно закрыть, не создав метку, —
// код тогда просто не понадобился.
export default defineEventHandler(async (event): Promise<PromoNewCode> => {
  await requireEmployeeRole(event, PROMO_ROLES);

  try {
    const code = await generatePromoCode();

    return { code, ...(await readPromoLinkUrls(code)) };
  } catch (error) {
    throw rejectPromoFailure(error);
  }
});
