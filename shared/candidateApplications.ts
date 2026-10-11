import type { WebLanguage } from './denials';
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

/** Итог сверки словами — для карточки заявки в теме группы (issue #463) и админки заявок. */
export const CANDIDATE_MATCH_LABELS: Readonly<Record<CandidateMatch, string>> = {
  not_in_park: 'Нет в парке',
  not_in_registry: 'Нет в реестре, Fleet номер знает',
  working: 'Работает в парке',
  former: 'Работал раньше',
  no_trips: 'В реестре, поездок нет',
  lookup_failed: 'Не удалось сверить',
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
 * - `employee` — Telegram сотрудника парка: так же перечитывается. Номер сотрудника заявку
 *   не останавливает — отказ по номеру сказал бы любому, сотрудник ли его владелец
 *   (docs/decisions.md → «Заявка в чате бота»);
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

/** Строк на странице обеих таблиц раздела «Заявки» (issue #471). */
export const APPLICATIONS_PAGE_SIZE = 25;

/**
 * Сколько часов ожидания ответа — порог «Дольше суток»: таких кандидатов парк может потерять
 * (docs/decisions.md → «Заявки в админке»).
 */
export const APPLICATION_OVERDUE_HOURS = 24;

/**
 * Через сколько минут после `/start` молчащий человек попадает в «Не закончили» (issue #475).
 * Написавший сам — сразу (docs/decisions.md → «„Не закончили“ в заявках»).
 */
export const UNFINISHED_VISIBLE_AFTER_MINUTES = 60;

/** Предел ответа из админки — предел текста одного сообщения Telegram. */
export const CANDIDATE_REPLY_MAX_LENGTH = 4096;

/**
 * Фильтр списка заявок — пилюли над таблицей. `waiting` — заявки, ждущие ответа сотрудника;
 * остальные, кроме `all`, — по статусу.
 */
export type ApplicationFilter = 'all' | 'waiting' | CandidateApplicationStatus;

export const APPLICATION_FILTERS: readonly ApplicationFilter[] = [
  'all',
  'waiting',
  'new',
  'in_progress',
  'hired',
  'rejected',
];

export const isApplicationFilter = (value: unknown): value is ApplicationFilter =>
  typeof value === 'string' && (APPLICATION_FILTERS as readonly string[]).includes(value);

/** Статус, который ставит отметка сотрудника: «Оформлен», «Отказ» и «Вернуть в работу». */
export type ApplicationMarkStatus = Extract<CandidateApplicationStatus, 'hired' | 'rejected' | 'in_progress'>;

export const isApplicationMarkStatus = (value: unknown): value is ApplicationMarkStatus =>
  value === 'hired' || value === 'rejected' || value === 'in_progress';

/**
 * Отказ ручек раздела «Заявки» (issue #471) — кодом, по которому решает экран
 * (docs/principles.md → «Ошибки»):
 *
 * - `application_not_found` — заявки с таким идентификатором нет;
 * - `status_invalid` — в теле не «Оформлен», «Отказ» или «В работе»;
 * - `status_transition_invalid` — из нынешнего статуса в этот отметкой не перейти: заявку уже
 *   отметили или вернули;
 * - `open_application_exists` — вернуть в работу нельзя: у кандидата уже есть другая открытая
 *   заявка на тот же Telegram или тот же номер из Telegram;
 * - `message_invalid` — ответ кандидату пустой или длиннее предела Telegram;
 * - `cannot_write` — бот не может писать кандидату;
 * - `telegram_error` — Telegram не принял сообщение;
 * - `draft_not_found` — человека из «Не закончили» с таким идентификатором нет (issue #475);
 * - `draft_closed` — человек уже подал заявку: черновик закончен.
 *
 * Словарь отдельный от `shared/denials.ts`, как у промо-меток: там — отказы двери, здесь —
 * предмет разговора (docs/decisions.md → «Отказ двери веба говорит кодом»).
 */
export type ApplicationDenialCode =
  | 'application_not_found'
  | 'status_invalid'
  | 'status_transition_invalid'
  | 'open_application_exists'
  | 'message_invalid'
  | 'cannot_write'
  | 'telegram_error'
  | 'draft_not_found'
  | 'draft_closed';

const APPLICATION_DENIAL_TEXTS: Readonly<Record<ApplicationDenialCode, Readonly<Record<WebLanguage, string>>>> = {
  application_not_found: { ru: 'Такой заявки нет.' },
  status_invalid: { ru: 'Такого статуса у заявки нет.' },
  status_transition_invalid: { ru: 'Статус заявки уже сменили. Обновите страницу.' },
  open_application_exists: { ru: 'У кандидата уже есть открытая заявка. Эту заявку вернуть в работу нельзя.' },
  message_invalid: { ru: `Сообщение должно быть от 1 до ${CANDIDATE_REPLY_MAX_LENGTH} знаков.` },
  cannot_write: { ru: 'Бот не может писать кандидату. Позвоните ему.' },
  telegram_error: { ru: 'Telegram не принял сообщение. Отправьте ещё раз.' },
  draft_not_found: { ru: 'Такого человека в списке нет.' },
  draft_closed: { ru: 'Человек уже подал заявку. Обновите страницу.' },
};

export const applicationDenialText = (code: ApplicationDenialCode, language: WebLanguage): string =>
  APPLICATION_DENIAL_TEXTS[code][language];
