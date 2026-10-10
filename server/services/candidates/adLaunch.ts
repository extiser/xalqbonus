import { findPromoLink } from '#server/repositories/promo';
import { readPromoCode } from '#shared/promoLinks';

/**
 * Код метки рекламы в Telegram из `start_param` приложения или параметра `/start` (issue #456,
 * issue #467). `null` — параметр не метка, метки нет в справочнике или носитель у неё другой.
 *
 * Заявку открывает только реклама в Telegram, остальные метки ведут в регистрацию и приветствие,
 * как раньше (docs/decisions.md → «Заявка кандидата»). Вход метки здесь не читается: он решает
 * только ссылку, и заявку принимают обе двери у любой метки рекламы (docs/decisions.md →
 * «Заявка в чате бота»).
 */
export const readAdPromoCode = async (startParam: string | null): Promise<string | null> => {
  const code = readPromoCode(startParam ?? '');

  if (code === null) {
    return null;
  }

  const promo = await findPromoLink(code);

  return promo?.medium === 'telegram_ad' ? code : null;
};
