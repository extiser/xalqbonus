import { describe, expect, it } from 'vitest';

import { generateOrderCode, generateRewardCode } from '#server/services/orders/orderCode';

/**
 * Коды заказа и награды разведены первой цифрой (issue #172): заказ `0`–`4`, награда `5`–`9`.
 * На этом держится то, что у стойки с одним полем двух одинаковых кодов не бывает, —
 * перекрёстной проверки при рождении кода нет, и сломанный диапазон ничто другое не поймает.
 */
describe('коды выдачи', () => {
  const ATTEMPTS = 20_000;

  it('код заказа — пять цифр с первой 0–4, и все пять первых цифр встречаются', () => {
    const firstDigits = new Set<string>();

    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const code = generateOrderCode();

      expect(code).toMatch(/^[0-4]\d{4}$/);
      firstDigits.add(code[0] ?? '');
    }

    expect([...firstDigits].sort()).toEqual(['0', '1', '2', '3', '4']);
  });

  it('код награды — пять цифр с первой 5–9, и все пять первых цифр встречаются', () => {
    const firstDigits = new Set<string>();

    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const code = generateRewardCode();

      expect(code).toMatch(/^[5-9]\d{4}$/);
      firstDigits.add(code[0] ?? '');
    }

    expect([...firstDigits].sort()).toEqual(['5', '6', '7', '8', '9']);
  });
});
