import type { CandidateTopicCard } from '#server/repositories/candidateApplications';
// Относительными путями, а не через `#shared`: модуль собирается ещё и в воркер, а там
// из псевдонимов настроен один `#server` (package.json → `build:worker`).
import { CANDIDATE_MATCH_LABELS } from '../../../shared/candidateApplications';
import { formatPhone } from '../../../shared/phone';
import { escapeHtml } from '../../../shared/telegramHtml';

/**
 * Что бот пишет сотрудникам в теме кандидата (issue #463): название темы, карточка заявки
 * и объяснения, почему сообщение кандидату не ушло.
 *
 * Только по-русски и не в словаре `server/bot/texts.ts`: тот — для водителя и кандидата
 * на двух языках, а группа сотрудников одна и читает по-русски. Подстановки экранируются:
 * имя и метка набраны людьми, и угловая скобка в них сломала бы сообщение целиком.
 */

/** Предел названия темы у Telegram. */
const TOPIC_NAME_MAX_LENGTH = 128;

/** Название темы: «Азиз · +998 90 123-45-67». Разметки у названия нет — не экранируется. */
export const topicName = (name: string, phoneE164: string): string =>
  `${name} · ${formatPhone(phoneE164).display}`.slice(0, TOPIC_NAME_MAX_LENGTH);

/** `YYYY-MM-DD` → `ДД.ММ.ГГГГ`. */
const formatDay = (day: string): string => {
  const [year, month, date] = day.split('-');

  return `${date}.${month}.${year}`;
};

/**
 * Карточка заявки — первое сообщение темы. Последняя строка — адрес заявки в админке:
 * страница `/applications/{id}` появится задачей админки заявок, и та обязана держать
 * этот адрес. Адреса приложения нет — нет и строки.
 */
export const topicCardText = (card: CandidateTopicCard, appOrigin: string | null): string => {
  const telegram =
    card.telegramUsername === null
      ? escapeHtml(card.telegramName)
      : `${escapeHtml(card.telegramName)}, @${escapeHtml(card.telegramUsername)}`;
  const promo =
    card.promoLinkName === null
      ? escapeHtml(card.promoCode)
      : `${escapeHtml(card.promoLinkName)} · ${escapeHtml(card.promoCode)}`;
  const match =
    card.lastTripDay === null
      ? CANDIDATE_MATCH_LABELS[card.match]
      : `${CANDIDATE_MATCH_LABELS[card.match]}, последняя поездка ${formatDay(card.lastTripDay)}`;

  return [
    '<b>Новая заявка</b>',
    `${escapeHtml(card.name)} · ${formatPhone(card.phoneE164).display}`,
    `Telegram: ${telegram}`,
    `Метка: ${promo}`,
    `Сверка: ${match}`,
    `Писать в бот: ${card.writeAllowed ? 'можно' : 'нельзя, звоните'}`,
    ...(appOrigin === null ? [] : [escapeHtml(`${appOrigin}/applications/${card.id}`)]),
  ].join('\n');
};

/** Бот не может писать кандидату — не разрешено или чат умер: менеджер звонит. */
export const cannotWriteText = (phoneE164: string): string =>
  `Бот не может написать кандидату. Позвоните ему: ${formatPhone(phoneE164).display}`;

export const NOT_EMPLOYEE_TEXT =
  'Это сообщение кандидату не ушло: ваш Telegram не привязан к учётной записи сотрудника. Ссылку привязки выдают в разделе «Сотрудники».';

export const TELEGRAM_ERROR_TEXT = 'Это сообщение кандидату не ушло: Telegram не ответил. Отправьте его ещё раз.';
