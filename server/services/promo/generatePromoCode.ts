import { randomBytes } from 'node:crypto';

import { isPromoCodeTaken } from '#server/repositories/promo';
import { PROMO_START_PREFIX } from '../../../shared/promoLinks';

/**
 * Новый код промо-метки (issue #380): `p_` и 6 случайных символов base64url — формат
 * `shared/promoLinks.ts`, тот, что разбирает бот.
 *
 * Код выдаётся автоматически и руками не вводится: он уйдёт в печать. Повтор — пока код занят
 * меткой или уже встречался в касаниях: код, который кто-то набрал в ссылке руками, выданный
 * новой метке, принёс бы ей чужие переходы.
 *
 * Свободный код не бронируется: форма может закрыться, не создав метку. Двоих с одним кодом
 * разводит первичный ключ при создании.
 */

/** Сколько символов после префикса: 64⁶ ≈ 6,9·10¹⁰ кодов — повтор почти невозможен. */
const CODE_LENGTH = 6;

const randomCode = (): string =>
  `${PROMO_START_PREFIX}${randomBytes(CODE_LENGTH).toString('base64url').slice(0, CODE_LENGTH)}`;

export const generatePromoCode = async (
  isTaken: (code: string) => Promise<boolean> = isPromoCodeTaken,
): Promise<string> => {
  for (;;) {
    const code = randomCode();

    if (!(await isTaken(code))) {
      return code;
    }
  }
};
