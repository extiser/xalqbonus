import { findPromoLink } from '#server/repositories/promo';
import { readPromoCode } from '#shared/promoLinks';

/**
 * Код метки рекламы в Telegram, которой открыто приложение (issue #456). `null` — приложение открыто
 * не ссылкой метки, метки нет в справочнике или носитель у неё другой.
 *
 * Носитель решает вход: экран заявки открывает только реклама в Telegram, остальные метки ведут
 * в регистрацию, как раньше (docs/decisions.md → «Заявка кандидата»).
 */
export const readAdPromoCode = async (startParam: string | null): Promise<string | null> => {
  const code = readPromoCode(startParam ?? '');

  if (code === null) {
    return null;
  }

  const promo = await findPromoLink(code);

  return promo?.medium === 'telegram_ad' ? code : null;
};
