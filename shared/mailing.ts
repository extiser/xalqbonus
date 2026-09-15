import { escapeHtml } from './telegramHtml';

/**
 * Сообщение рассылки и его пределы — одно на обе стороны.
 *
 * Сборку зовут и отправка, и форма со счётчиком знаков, а фразу про перебор — и отказ ручки
 * запуска, и причина рядом с закрытой кнопкой. Две реализации разошлись бы на первой же
 * правке, и разошлись бы тихо: форма показала бы один остаток, а Telegram отказал бы
 * по другому.
 *
 * Импорт относительный: модуль собирается в воркер, а там из псевдонимов есть один `#server`.
 */

/**
 * Потолок текста без фото — предел `sendMessage` у Bot API.
 *
 * Он же жёсткий предел каждого поля при сохранении: длиннее Telegram не примет ни в каком
 * виде, и роман в базу заливать незачем. От фото этот предел не зависит.
 */
export const MAILING_TEXT_MAX_LENGTH = 4096;

/** Потолок текста с фото — предел подписи `sendPhoto`, вчетверо меньше. */
export const MAILING_CAPTION_MAX_LENGTH = 1024;

export const MAILING_HEADING_RU = '🇷🇺 Русский';
export const MAILING_HEADING_UZ = '🇺🇿 Oʻzbekcha';

/** Потолок, который действует для сообщения: с фото текст становится подписью. */
export const mailingMessageLimit = (withPhoto: boolean): number =>
  withPhoto ? MAILING_CAPTION_MAX_LENGTH : MAILING_TEXT_MAX_LENGTH;

export type MailingMessage = {
  /**
   * Сообщение так, как его увидит водитель. По нему считается длина: Telegram меряет предел
   * после разбора разметки, и ни `<b>`, ни `&amp;` в подсчёт не входят.
   */
  text: string;
  /** То же под `parse_mode: HTML` — это и уходит в Telegram. */
  html: string;
};

/**
 * Собирает сообщение рассылки из двух текстов.
 *
 * Оба языка уходят одним сообщением, русский первым, каждый под жирным заголовком — а не
 * на языке аккаунта: язык выставляется один раз при регистрации и сменить его водителю
 * негде (решение Руслана 15-09-2026, issue #136). Пустой узбекский — уходит один русский,
 * и заголовков нет вовсе: у одноязычного сообщения подписывать нечего.
 *
 * Тексты обрезаются по краям так же, как при сохранении: форма зовёт сборку на набранном,
 * и счётчик обязан считать то, что ляжет в базу.
 *
 * Экранируются только тексты: заголовки наши и разметки не содержат.
 */
export const buildMailingMessage = (textRu: string, textUz: string | null): MailingMessage => {
  const russian = textRu.trim();
  const uzbek = (textUz ?? '').trim();

  if (uzbek === '') {
    return { text: russian, html: escapeHtml(russian) };
  }

  return {
    text: `${MAILING_HEADING_RU}\n${russian}\n\n${MAILING_HEADING_UZ}\n${uzbek}`,
    html:
      `<b>${MAILING_HEADING_RU}</b>\n${escapeHtml(russian)}\n\n` +
      `<b>${MAILING_HEADING_UZ}</b>\n${escapeHtml(uzbek)}`,
  };
};

/** Фраза про перебор — одна на отказ запуска и на причину рядом с закрытой кнопкой. */
export const mailingTooLongText = (length: number, limit: number, withPhoto: boolean): string =>
  `Сообщение вместе с заголовками языков — ${length} знаков, а Telegram принимает ` +
  `${withPhoto ? 'в подписи к фото' : 'в сообщении'} не больше ${limit}. Сократите тексты.`;

/**
 * Почему рассылку нельзя запустить по длине. `null` — сообщение влезает.
 *
 * Это условие запуска, а не сохранения: черновик — рабочее состояние, и человек вправе
 * сначала положить картинку, а потом подрезать текст (issue #136, прогон 15-09-2026).
 */
export const mailingLengthProblem = (
  textRu: string,
  textUz: string | null,
  withPhoto: boolean,
): string | null => {
  const limit = mailingMessageLimit(withPhoto);
  const { length } = buildMailingMessage(textRu, textUz).text;

  return length > limit ? mailingTooLongText(length, limit, withPhoto) : null;
};
