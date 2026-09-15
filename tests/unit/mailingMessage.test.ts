import { describe, expect, it } from 'vitest';

import {
  buildMailingMessage,
  MAILING_HEADING_RU,
  MAILING_HEADING_UZ,
} from '#shared/mailing';

/**
 * Склейка сообщения рассылки — та, что уходит в Telegram и что считает форма.
 *
 * Функция одна на обе стороны, и проверяется здесь именно она: порядок блоков, заголовки,
 * одноязычный случай и то, что экранируются тексты, а не заголовки.
 */

describe('сообщение рассылки', () => {
  it('оба текста в одном сообщении, русский первым, каждый под жирным заголовком', () => {
    const message = buildMailingMessage('Новое приложение', 'Yangi ilova');

    expect(message.text).toBe('🇷🇺 Русский\nНовое приложение\n\n🇺🇿 Oʻzbekcha\nYangi ilova');
    expect(message.html).toBe(
      '<b>🇷🇺 Русский</b>\nНовое приложение\n\n<b>🇺🇿 Oʻzbekcha</b>\nYangi ilova',
    );
  });

  it('пустой узбекский даёт один русский текст без заголовка', () => {
    for (const empty of [null, '', '   \n ']) {
      const message = buildMailingMessage('Только русский', empty);

      expect(message.text).toBe('Только русский');
      expect(message.html).toBe('Только русский');
      expect(message.text).not.toContain(MAILING_HEADING_RU);
    }
  });

  it('экранируются тексты, а не заголовки', () => {
    const message = buildMailingMessage('Скидка <50%> & подарок', 'a<b>c');

    expect(message.html).toBe(
      '<b>🇷🇺 Русский</b>\nСкидка &lt;50%&gt; &amp; подарок\n\n<b>🇺🇿 Oʻzbekcha</b>\na&lt;b&gt;c',
    );
    // Длина считается по тому, что увидит водитель: разметка в неё не входит.
    expect(message.text).toContain('Скидка <50%> & подарок');
  });

  it('длина склейки включает заголовки и пустую строку между блоками', () => {
    const russian = 'р'.repeat(500);
    const uzbek = 'o'.repeat(500);
    const overhead = `${MAILING_HEADING_RU}\n\n\n${MAILING_HEADING_UZ}\n`.length;

    expect(buildMailingMessage(russian, uzbek).text.length).toBe(1000 + overhead);
    expect(buildMailingMessage(russian, null).text.length).toBe(500);
  });
});
