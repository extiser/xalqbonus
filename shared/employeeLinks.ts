import type { WebLanguage } from './denials';
import { EMPLOYEE_NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './employee';
import type { EmployeeAccessLinkDeadOutcome, EmployeeInviteDeadOutcome } from './types/employee';

/**
 * Отказы ссылок сотрудника (issue #267): выпуск и принятие приглашения, пароль по ссылке —
 * код и текст к нему.
 *
 * Словарь отдельный от `shared/denials.ts`: там — отказы двери, кто вошёл и что ему открыто,
 * здесь — предмет разговора: ссылка устарела, телефон занят (docs/decisions.md → «Граница
 * словаря — дверь»). Устройство то же: код решает, что делает экран, текст берётся по коду.
 *
 * Читают обе стороны. Сервер кладёт текст в ответ отказавшей ручки, страница приглашения
 * берёт отсюда же строку мёртвой ссылки, которую ей отдаёт чтение по токену, — и строка
 * одна, открыл ли человек мёртвую ссылку или она умерла, пока он набирал пароль.
 *
 * Относительными путями, а не через `#shared`: так подключаются соседние файлы `shared/`.
 */

type Texts<Code extends string> = Readonly<Record<Code, Readonly<Record<WebLanguage, string>>>>;

/** Отказ выпуска приглашения — по полю формы. */
export type InviteIssueDenialCode =
  | 'full_name_missing'
  | 'full_name_too_long'
  | 'phone_invalid'
  | 'phone_taken'
  | 'driver_link_exists';

/** Поле формы «Пригласить», к которому относится отказ. */
export type InviteIssueField = 'fullName' | 'phone';

export const INVITE_ISSUE_DENIAL_FIELDS: Readonly<Record<InviteIssueDenialCode, InviteIssueField>> = {
  full_name_missing: 'fullName',
  full_name_too_long: 'fullName',
  phone_invalid: 'phone',
  phone_taken: 'phone',
  driver_link_exists: 'phone',
};

const INVITE_ISSUE_TEXTS: Texts<InviteIssueDenialCode> = {
  full_name_missing: { ru: 'Напишите имя: так сотрудник будет виден в списке и в журнале.' },
  full_name_too_long: { ru: `Имя — не длиннее ${EMPLOYEE_NAME_MAX_LENGTH} знаков.` },
  phone_invalid: { ru: 'Номер: плюс и от 7 до 15 цифр.' },
  phone_taken: { ru: 'Этот телефон уже занят: за ним учётная запись сотрудника или живое приглашение.' },
  driver_link_exists: {
    ru: 'Этот телефон за водителем программы. Водителем и сотрудником одновременно быть нельзя.',
  },
};

export const inviteIssueDenialText = (code: InviteIssueDenialCode, language: WebLanguage): string =>
  INVITE_ISSUE_TEXTS[code][language];

/** Строка мёртвого приглашения — на странице `/invite/<токен>`. */
const INVITE_DEAD_TEXTS: Texts<EmployeeInviteDeadOutcome> = {
  not_found: { ru: 'Ссылка не работает. Попросите новую.' },
  expired: { ru: 'Ссылка устарела — она действует двое суток. Попросите новую.' },
  accepted: { ru: 'Приглашение уже принято. Войдите со своим телефоном и паролем.' },
  revoked: { ru: 'Приглашение отозвали. Попросите новое.' },
};

export const inviteDeadText = (outcome: EmployeeInviteDeadOutcome, language: WebLanguage): string =>
  INVITE_DEAD_TEXTS[outcome][language];

/** Строка мёртвой ссылки «задать пароль» — на странице `/set-password/<токен>`. */
const PASSWORD_LINK_DEAD_TEXTS: Texts<EmployeeAccessLinkDeadOutcome> = {
  not_found: { ru: 'Ссылка не работает. Попросите новую.' },
  expired: { ru: 'Ссылка устарела — она действует двое суток. Попросите новую.' },
  used: { ru: 'Пароль по этой ссылке уже задан. Войдите со своим телефоном и паролем.' },
  // Отзывает ссылку только новый сброс пароля — значит, у сотрудника уже есть ссылка свежее.
  revoked: { ru: 'Эта ссылка заменена новой. Попросите свежую.' },
};

export const passwordLinkDeadText = (
  outcome: EmployeeAccessLinkDeadOutcome,
  language: WebLanguage,
): string => PASSWORD_LINK_DEAD_TEXTS[outcome][language];

/** Отказ принятия приглашения, кроме мёртвой ссылки. */
export type InviteAcceptDenialCode = 'password_too_short' | 'phone_taken' | 'driver_link_exists';

const INVITE_ACCEPT_TEXTS: Texts<InviteAcceptDenialCode> = {
  password_too_short: { ru: `Пароль — не короче ${PASSWORD_MIN_LENGTH} символов.` },
  phone_taken: {
    ru: 'На телефон из приглашения уже заведена учётная запись. Если это не вы, сообщите тому, кто прислал ссылку.',
  },
  driver_link_exists: {
    ru: 'Телефон из приглашения за водителем программы. Водителем и сотрудником одновременно быть нельзя — сообщите тому, кто прислал ссылку.',
  },
};

export const inviteAcceptDenialText = (code: InviteAcceptDenialCode, language: WebLanguage): string =>
  INVITE_ACCEPT_TEXTS[code][language];

/** Пароль, отвергнутый по длине, — на странице «задать пароль». */
export const passwordTooShortText = (language: WebLanguage): string =>
  INVITE_ACCEPT_TEXTS.password_too_short[language];
