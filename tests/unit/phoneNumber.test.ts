import { describe, expect, it } from 'vitest';

import { normalizeLoginPhone, normalizePhoneE164 } from '#server/utils/phoneNumber';

/**
 * Нормализация телефона покрывается тестом, хотя бот и ручки не покрываются
 * (docs/decisions.md → «Тесты только на ядро баллов»). Это исключение того же рода,
 * что нормализация номера ВУ: по этому полю идёт автопривязка, и расхождение между тем,
 * как номер пишет прогон реестра, и тем, как его читает регистрация, означает водителя,
 * которого бот не находит, хотя парк его знает.
 */
describe('normalizePhoneE164', () => {
  it('оставляет канонический номер как есть', () => {
    expect(normalizePhoneE164('+998901234567')).toBe('+998901234567');
  });

  it('дописывает плюс — так номер отдаёт Telegram', () => {
    expect(normalizePhoneE164('998901234567')).toBe('+998901234567');
  });

  it('сводит оба написания к одному ключу', () => {
    // Ровно то, ради чего функция одна на регистрацию и на синхронизацию: реестр
    // наполняет прогон, а ищет в нём бот.
    expect(normalizePhoneE164('998901234567')).toBe(normalizePhoneE164('+998901234567'));
  });

  it('снимает пробелы, дефисы и скобки', () => {
    expect(normalizePhoneE164(' +998 (90) 123-45-67 ')).toBe('+998901234567');
  });

  it('не принимает девять цифр без кода страны', () => {
    // Дописать `+998` за водителя значит решить за него, что номер узбекский, — и найти
    // в реестре постороннего человека вместе с его баллами.
    expect(normalizePhoneE164('901234567')).toBeNull();
  });

  it('не принимает чужой код страны', () => {
    expect(normalizePhoneE164('+79161234567')).toBeNull();
  });

  it('не принимает номер не той длины', () => {
    expect(normalizePhoneE164('+99890123456')).toBeNull();
    expect(normalizePhoneE164('+9989012345678')).toBeNull();
  });

  it('не принимает буквы', () => {
    expect(normalizePhoneE164('+998ABCDEFGHI')).toBeNull();
  });

  it('не принимает пустую строку', () => {
    expect(normalizePhoneE164('')).toBeNull();
  });
});

/**
 * Телефон входа сотрудника (issue #267): любой номер, а узбекский — в том же виде, что у
 * водительской нормализации. Разойдись они на узбекском номере — уже заведённые сотрудники
 * перестали бы входить.
 */
describe('normalizeLoginPhone', () => {
  it('принимает любой код страны', () => {
    expect(normalizeLoginPhone('+79001234567')).toBe('+79001234567');
    expect(normalizeLoginPhone('+1 (202) 555-01-23')).toBe('+12025550123');
  });

  it('узбекский номер приводит к тому же виду, что normalizePhoneE164', () => {
    for (const raw of ['+998901234567', '998901234567', ' +998 (90) 123-45-67 ']) {
      expect(normalizeLoginPhone(raw)).toBe(normalizePhoneE164(raw));
    }
  });

  it('держит рамку от 7 до 15 цифр', () => {
    expect(normalizeLoginPhone('+1234567')).toBe('+1234567');
    expect(normalizeLoginPhone('+123456')).toBeNull();
    expect(normalizeLoginPhone('+123456789012345')).toBe('+123456789012345');
    expect(normalizeLoginPhone('+1234567890123456')).toBeNull();
  });

  it('не принимает буквы, лишний плюс и пустую строку', () => {
    expect(normalizeLoginPhone('+7900ABC4567')).toBeNull();
    expect(normalizeLoginPhone('++79001234567')).toBeNull();
    expect(normalizeLoginPhone('')).toBeNull();
  });
});
