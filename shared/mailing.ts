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

/** Флаг языка — в начале первой строки своего блока, через обычный пробел. */
export const MAILING_LANGUAGE_FLAG_UZ = '🇺🇿 ';
export const MAILING_LANGUAGE_FLAG_RU = '🇷🇺 ';

/**
 * Разделитель блоков, с пустой строкой до и после. Короткий намеренно: длинная черта
 * на узком телефоне переносится на вторую строку (issue #160).
 */
export const MAILING_BLOCK_SEPARATOR = '━━━━━━━━';

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
 * Оба языка уходят одним сообщением — а не на языке аккаунта: язык выставляется один раз
 * при регистрации и сменить его водителю негде (решение Руслана 15-09-2026, issue #136).
 *
 * Узбекский блок первым, русский вторым — так же, как на обложке приглашения, где узбекский
 * текст главный и стоит сверху. Каждый блок начинается флагом прямо в первой строке, между
 * блоками — разделитель в пустых строках: строка-заголовок читалась служебным ярлыком,
 * а одна пустая строка не отличала границу языков от границы абзацев (issue #160).
 *
 * Флаги и разделитель ставятся, только когда заполнены оба текста. Один заполненный — русский
 * или узбекский — уходит как есть: у одноязычного сообщения помечать нечего
 * (решение Руслана 15-09-2026, PR #149). Длина тогда считается по этому одному блоку.
 *
 * Тексты обрезаются по краям так же, как при сохранении: форма зовёт сборку на набранном,
 * и счётчик обязан считать то, что ляжет в базу.
 *
 * Экранируются только тексты: флаги и разделитель наши и разметки не содержат.
 */
export const buildMailingMessage = (
  textRu: string | null,
  textUz: string | null,
): MailingMessage => {
  const russian = (textRu ?? '').trim();
  const uzbek = (textUz ?? '').trim();

  if (russian === '' || uzbek === '') {
    const single = russian === '' ? uzbek : russian;

    return { text: single, html: escapeHtml(single) };
  }

  const join = (uzbekBlock: string, russianBlock: string): string =>
    `${MAILING_LANGUAGE_FLAG_UZ}${uzbekBlock}\n\n${MAILING_BLOCK_SEPARATOR}\n\n` +
    `${MAILING_LANGUAGE_FLAG_RU}${russianBlock}`;

  return {
    text: join(uzbek, russian),
    html: join(escapeHtml(uzbek), escapeHtml(russian)),
  };
};

/** Фраза про перебор — одна на отказ запуска и на причину рядом с закрытой кнопкой. */
export const mailingTooLongText = (length: number, limit: number, withPhoto: boolean): string =>
  `Сообщение вместе с флагами и разделителем языков — ${length} знаков, а Telegram принимает ` +
  `${withPhoto ? 'в подписи к фото' : 'в сообщении'} не больше ${limit}. Сократите тексты.`;

/** Тексты рассылки, от которых зависит запуск. Пусто — `null` или пустая строка формы. */
export type MailingLaunchFields = {
  title: string | null;
  textRu: string | null;
  textUz: string | null;
};

/** Почему рассылку нельзя запустить. */
export type MailingLaunchProblem =
  | { kind: 'missing_title' }
  /** Нет текста ни на одном языке. Любого одного достаточно: рассылка только на узбекском — рабочий случай. */
  | { kind: 'missing_text' }
  | { kind: 'too_long'; length: number; limit: number; withPhoto: boolean };

const isBlank = (value: string | null): boolean => value === null || value.trim() === '';

/**
 * Все причины, по которым рассылку нельзя запустить, сразу. Пустой список — можно.
 *
 * Сразу все, а не первая: правка по одной причине за круг — это три круга там, где хватает
 * одного взгляда (issue #148). Список один на ручку запуска, которая решает, и на экран,
 * который закрывает кнопку и перечисляет причины рядом с ней.
 *
 * Это условия запуска, а не сохранения: черновик — рабочее состояние, он заводится первым
 * символом, и человек вправе сначала положить картинку, а потом подрезать текст (issue #136).
 *
 * Пустой аудитории здесь нет: её знает только подсчёт в базе, и отказ о ней отдельный —
 * `MAILING_AUDIENCE_EMPTY_TEXT`.
 */
export const mailingLaunchProblems = (
  fields: MailingLaunchFields,
  withPhoto: boolean,
): MailingLaunchProblem[] => {
  const problems: MailingLaunchProblem[] = [];

  if (isBlank(fields.title)) {
    problems.push({ kind: 'missing_title' });
  }

  if (isBlank(fields.textRu) && isBlank(fields.textUz)) {
    problems.push({ kind: 'missing_text' });
  }

  const limit = mailingMessageLimit(withPhoto);
  const { length } = buildMailingMessage(fields.textRu, fields.textUz).text;

  if (length > limit) {
    problems.push({ kind: 'too_long', length, limit, withPhoto });
  }

  return problems;
};

/** Причина человеческим языком — одна фраза и для отказа ручки, и для строки у кнопки. */
export const mailingLaunchProblemText = (problem: MailingLaunchProblem): string => {
  switch (problem.kind) {
    case 'missing_title':
      return 'Нет заголовка.';
    case 'missing_text':
      return 'Нет текста ни на одном языке.';
    case 'too_long':
      return mailingTooLongText(problem.length, problem.limit, problem.withPhoto);
  }
};

/**
 * Сколько часов после отправки Telegram даёт боту удалить своё сообщение в приватном чате.
 * Окно рассылки считается от самого раннего отправленного: разброс между первым и последним
 * адресатом меньше десяти минут и отдельной арифметики не стоит (issue #150).
 */
export const MAILING_RECALL_WINDOW_HOURS = 48;

/** Почему рассылку нельзя отозвать. Уже начатый отзыв — не причина: повтор нажатия ничего не делает. */
export type MailingRecallProblem = 'not_sent_yet' | 'nothing_sent' | 'window_expired';

/** Причина человеческим языком — одна фраза и для отказа ручки, и для строки у погашенной кнопки. */
export const mailingRecallProblemText = (problem: MailingRecallProblem): string => {
  switch (problem) {
    case 'not_sent_yet':
      return 'Отозвать можно только завершённую или остановленную рассылку. Идущую сначала остановите.';
    case 'nothing_sent':
      return 'Отзывать нечего: сообщение не дошло ни до кого.';
    case 'window_expired':
      return `Прошло больше ${MAILING_RECALL_WINDOW_HOURS} часов, Telegram больше не даёт удалить.`;
  }
};

/** Адресатов ноль — фраза одна на отказ запуска и на причину у закрытой кнопки. */
export const MAILING_AUDIENCE_EMPTY_TEXT =
  'Участников программы с привязанным Telegram сейчас нет — рассылать некому.';
