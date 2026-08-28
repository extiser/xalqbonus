import { describe, expect, it } from 'vitest';

import { hasUnmappedCyrillic, normalizeLicenseNumber } from '#server/utils/licenseNumber';

describe('normalizeLicenseNumber', () => {
  it('приводит к верхнему регистру', () => {
    expect(normalizeLicenseNumber('af1234567')).toBe('AF1234567');
  });

  it('снимает пробелы и дефисы', () => {
    expect(normalizeLicenseNumber(' AF 12-34 567 ')).toBe('AF1234567');
  });

  it('снимает префикс страны', () => {
    expect(normalizeLicenseNumber('UZAF1234567')).toBe('AF1234567');
  });

  it('сводит оба написания одного номера к одному ключу', () => {
    expect(normalizeLicenseNumber('UZAF1234567')).toBe(normalizeLicenseNumber('AF1234567'));
  });

  it('не снимает UZ, если без него остаток на номер не похож', () => {
    // Без буквенной серии это уже не номер, а семь цифр: префикс тут не префикс.
    expect(normalizeLicenseNumber('UZ1234567')).toBe('UZ1234567');
  });

  it('не снимает UZ, если цифр слишком мало', () => {
    expect(normalizeLicenseNumber('UZAF123')).toBe('UZAF123');
  });

  describe('транслитерация кириллицы', () => {
    // Пары взяты из реестра: серия существует в обоих написаниях, и они обязаны сойтись.
    it.each([
      ['AФ1234567', 'AF1234567'],
      ['AГЛ1234567', 'AGL1234567'],
      ['AГT1234567', 'AGT1234567'],
      ['AГБ1234567', 'AGB1234567'],
      ['AAБ1234567', 'AAB1234567'],
    ])('%s → %s', (cyrillic, latin) => {
      expect(normalizeLicenseNumber(cyrillic)).toBe(latin);
      expect(normalizeLicenseNumber(cyrillic)).toBe(normalizeLicenseNumber(latin));
    });

    it('переводит и вместе с префиксом страны', () => {
      expect(normalizeLicenseNumber('UZAГЛ1234567')).toBe('AGL1234567');
    });

    it('пять неподтверждённых букв идут транслитерацией, а не начертанием', () => {
      // В В Н Р С У транслит расходится с похожим начертанием (V N R S U против B H P C Y).
      // В данных этих букв нет ни разу — тест фиксирует принятый выбор, чтобы он
      // не изменился молча при рефакторинге.
      expect(normalizeLicenseNumber('AВ1234567')).toBe('AV1234567');
      expect(normalizeLicenseNumber('AН1234567')).toBe('AN1234567');
      expect(normalizeLicenseNumber('AР1234567')).toBe('AR1234567');
      expect(normalizeLicenseNumber('AС1234567')).toBe('AS1234567');
      expect(normalizeLicenseNumber('AУ1234567')).toBe('AU1234567');
    });

    it('буква вне таблицы оставляет номер как есть — не угадываем', () => {
      expect(normalizeLicenseNumber('AЧ1234567')).toBe('AЧ1234567');
      expect(normalizeLicenseNumber('aч1234567')).toBe('aч1234567');
    });
  });

  it('чисто цифровой номер не трогает', () => {
    expect(normalizeLicenseNumber('1234567890')).toBe('1234567890');
  });

  it('пустую строку возвращает пустой', () => {
    expect(normalizeLicenseNumber('')).toBe('');
  });

  it('идемпотентна: повторный прогон ничего не меняет', () => {
    const once = normalizeLicenseNumber('uz aГЛ-1234567');
    expect(normalizeLicenseNumber(once)).toBe(once);
  });
});

describe('hasUnmappedCyrillic', () => {
  it('видит букву, которой нет в таблице', () => {
    expect(hasUnmappedCyrillic('AЧ1234567')).toBe(true);
  });

  it('на переведённом номере молчит', () => {
    expect(hasUnmappedCyrillic('AГЛ1234567')).toBe(false);
  });

  it('на латинском номере молчит', () => {
    expect(hasUnmappedCyrillic('AF1234567')).toBe(false);
  });
});
