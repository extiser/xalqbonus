import { describe, expect, it } from 'vitest';

import {
  buildMailingMessage,
  MAILING_BLOCK_SEPARATOR,
  MAILING_LANGUAGE_FLAG_RU,
  MAILING_LANGUAGE_FLAG_UZ,
} from '#shared/mailing';

/**
 * Склейка сообщения рассылки — та, что уходит в Telegram и что считает форма.
 *
 * Функция одна на обе стороны, и проверяется здесь именно она: порядок блоков, флаги,
 * разделитель, одноязычный случай и то, что экранируются тексты, а не флаги с разделителем.
 */

describe('сообщение рассылки', () => {
  it('оба текста в одном сообщении: узбекский первым, флаги в начале блоков, разделитель между ними', () => {
    const message = buildMailingMessage('Новое приложение', 'Yangi ilova');
    const expected = '🇺🇿 Yangi ilova\n\n━━━━━━━━\n\n🇷🇺 Новое приложение';

    expect(message.text).toBe(expected);
    // Флаги без жирной разметки: в html то же самое, экранировать здесь нечего.
    expect(message.html).toBe(expected);
    expect(message.text).not.toContain('Русский');
    expect(message.text).not.toContain('Oʻzbekcha');
  });

  it('разделитель — восемь символов ━ отдельной строкой', () => {
    expect(MAILING_BLOCK_SEPARATOR).toBe('━'.repeat(8));

    const lines = buildMailingMessage('Первый\nвторой', 'Birinchi\nikkinchi').text.split('\n');

    expect(lines).toEqual([
      '🇺🇿 Birinchi',
      'ikkinchi',
      '',
      '━━━━━━━━',
      '',
      '🇷🇺 Первый',
      'второй',
    ]);
  });

  it('пустой узбекский даёт один русский текст без флага и разделителя', () => {
    for (const empty of [null, '', '   \n ']) {
      const message = buildMailingMessage('Только русский', empty);

      expect(message.text).toBe('Только русский');
      expect(message.html).toBe('Только русский');
      expect(message.text).not.toContain(MAILING_LANGUAGE_FLAG_RU.trim());
      expect(message.text).not.toContain(MAILING_BLOCK_SEPARATOR);
    }
  });

  it('пустой русский даёт один узбекский текст без флага и разделителя', () => {
    for (const empty of [null, '', '   \n ']) {
      const message = buildMailingMessage(empty, 'Faqat oʻzbekcha');

      expect(message.text).toBe('Faqat oʻzbekcha');
      expect(message.html).toBe('Faqat oʻzbekcha');
      expect(message.text).not.toContain(MAILING_LANGUAGE_FLAG_UZ.trim());
      expect(message.text).not.toContain(MAILING_BLOCK_SEPARATOR);
    }
  });

  it('экранируются тексты, а не флаги и разделитель', () => {
    const message = buildMailingMessage('Скидка <50%> & подарок', 'a<b>c');

    expect(message.html).toBe(
      '🇺🇿 a&lt;b&gt;c\n\n━━━━━━━━\n\n🇷🇺 Скидка &lt;50%&gt; &amp; подарок',
    );
    // Длина считается по тому, что увидит водитель: разметка в неё не входит.
    expect(message.text).toBe('🇺🇿 a<b>c\n\n━━━━━━━━\n\n🇷🇺 Скидка <50%> & подарок');
  });

  it('длина склейки включает флаги, разделитель и пустые строки', () => {
    const russian = 'р'.repeat(500);
    const uzbek = 'o'.repeat(500);
    const overhead =
      `${MAILING_LANGUAGE_FLAG_UZ}\n\n${MAILING_BLOCK_SEPARATOR}\n\n${MAILING_LANGUAGE_FLAG_RU}`.length;

    // Флаг — два региональных индикатора, по две единицы UTF-16 каждый, плюс пробел: 5 на флаг.
    expect(overhead).toBe(5 + 4 + 8 + 5);
    expect(buildMailingMessage(russian, uzbek).text.length).toBe(1000 + overhead);
    // Один блок — его длина: флагов и разделителя у одноязычного сообщения нет.
    expect(buildMailingMessage(russian, null).text.length).toBe(500);
    expect(buildMailingMessage(null, uzbek).text.length).toBe(500);
  });
});
