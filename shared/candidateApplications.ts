import type { CandidateApplicationStatus, CandidateMatch } from '../server/generated/prisma/enums';

/**
 * Заявка кандидата (issue #456): пределы полей, порог «работал раньше», подписи статусов
 * и отказы ручки заявки.
 *
 * Лежит в `shared/`: имя проверяют и экран, гасящий кнопку, и сервис, а подписи статусов
 * прочитает админка заявок. Относительными путями, а не через `#shared`: так подключаются
 * соседние файлы `shared/`.
 */

export type { CandidateApplicationStatus, CandidateMatch };

/** Имя в заявке — обрезанное по краям, от одного знака до этого предела. Тот же предел — в миграции. */
export const CANDIDATE_NAME_MAX_LENGTH = 60;

/**
 * Сколько суток от последней поездки до сегодняшних по Ташкенту человек ещё «работает в парке».
 * Дальше — «работал раньше» (docs/decisions.md → «Заявка кандидата»).
 */
export const FORMER_DRIVER_DAYS = 90;

/**
 * Сколько сверка номера ждёт поиска в Fleet API, мс. Заявка ждёт сверку целиком, а клиент Fleet
 * повторяет запрос до пяти раз с долгим таймаутом: без срока кандидат ждал бы минутами, а экран
 * старого телефона показал бы сбой при уже записанной заявке (issue #460).
 */
export const CANDIDATE_LOOKUP_BUDGET_MS = 8_000;

export const CANDIDATE_APPLICATION_STATUS_LABELS: Readonly<Record<CandidateApplicationStatus, string>> = {
  new: 'Новая',
  in_progress: 'В работе',
  hired: 'Оформлен',
  rejected: 'Отказ',
};

const CANDIDATE_MATCHES: readonly CandidateMatch[] = [
  'not_in_park',
  'not_in_registry',
  'working',
  'former',
  'no_trips',
  'lookup_failed',
];

export const isCandidateMatch = (value: unknown): value is CandidateMatch =>
  typeof value === 'string' && (CANDIDATE_MATCHES as readonly string[]).includes(value);

/**
 * Отказ ручки заявки — кодом, по которому решает экран (docs/principles.md → «Ошибки»):
 *
 * - `not_ad_launch` — приложение открыто не ссылкой метки рекламы в Telegram;
 * - `member` — этот Telegram уже в программе: экран перечитывается и становится экраном участника;
 * - `employee` — сотрудник парка: так же перечитывается;
 * - `name_invalid` — имя пустое или длиннее предела;
 * - `contact_missing` — нет подписанной строки контакта или она не разбирается;
 * - `contact_rejected` — подпись строки контакта не сошлась или строка просрочена;
 * - `contact_not_own` — номером поделился не тот, кто открыл приложение;
 * - `phone_invalid` — номер не узбекский или не девять цифр после `+998`;
 * - `language_invalid` — язык не `ru` и не `uz`.
 */
export type CandidateApplicationDenialCode =
  | 'not_ad_launch'
  | 'member'
  | 'employee'
  | 'name_invalid'
  | 'contact_missing'
  | 'contact_rejected'
  | 'contact_not_own'
  | 'phone_invalid'
  | 'language_invalid';

export type CandidateApplicationDenialPayload = { code: CandidateApplicationDenialCode };

/** Имя заявки, обрезанное по краям. `null` — пустое или длиннее предела. */
export const readCandidateName = (value: string): string | null => {
  const name = value.trim();

  return name.length >= 1 && name.length <= CANDIDATE_NAME_MAX_LENGTH ? name : null;
};

/** Цифр номера после `+998` — столько вводит руками кандидат на старом Telegram. */
export const MANUAL_PHONE_DIGITS = 9;

/**
 * Номер, введённый руками после `+998`: пробелы и дефисы отбрасываются, остаться должно ровно
 * девять цифр. `null` — не номер. Код страны стоит на экране отдельно и не вводится.
 */
export const readManualPhone = (value: string): string | null => {
  const digits = value.replace(/[\s-]/g, '');

  return new RegExp(`^\\d{${MANUAL_PHONE_DIGITS}}$`).test(digits) ? `+998${digits}` : null;
};
