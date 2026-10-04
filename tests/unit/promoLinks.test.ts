import { describe, expect, it } from 'vitest';

import { readPromoCode } from '#shared/promoLinks';

/**
 * Разбор кода промо-метки (issue #377): годный код — строка в `promo_touches`, негодный —
 * апдейт идёт дальше как обычно и ничего не пишется.
 */
describe('readPromoCode', () => {
  it('годный код возвращается целиком, с префиксом', () => {
    expect(readPromoCode('p_poster1')).toBe('p_poster1');
  });

  it('пропускает весь алфавит base64url', () => {
    expect(readPromoCode('p_Az09_-')).toBe('p_Az09_-');
  });

  it('параметр ровно в 64 символа годен', () => {
    const parameter = `p_${'a'.repeat(62)}`;

    expect(readPromoCode(parameter)).toBe(parameter);
  });

  it.each([
    ['пустой остаток', 'p_'],
    ['без префикса', 'poster1'],
    ['кириллица', 'p_пост'],
    ['знак вне base64url', 'p_a=b'],
    ['длиннее 64 символов', `p_${'a'.repeat(63)}`],
    ['пустой параметр', ''],
  ])('%s — null', (_case, parameter) => {
    expect(readPromoCode(parameter)).toBeNull();
  });
});
