// `createError` берётся из `h3` явно, а не автоимпортом: в общем пространстве имён имя занято
// обёрткой Nuxt, у которой номер ответа необязателен (`denial.ts`).
import { createError, type H3Error } from 'h3';

import { WEB_LANGUAGE } from '#shared/denials';
import {
  INVITE_ISSUE_DENIAL_FIELDS,
  inviteAcceptDenialText,
  inviteDeadText,
  inviteIssueDenialText,
  passwordLinkDeadText,
  passwordTooShortText,
  type InviteAcceptDenialCode,
  type InviteIssueDenialCode,
} from '#shared/employeeLinks';
import type { EmployeeAccessLinkDeadOutcome, EmployeeInviteDeadOutcome } from '#shared/types/employee';

/**
 * Отказы ссылок сотрудника в ответе HTTP (issue #267): код — странице для решения, поле формы —
 * куда встанет текст, текст — из словаря `shared/employeeLinks.ts`.
 *
 * Мёртвая ссылка отвечает `409`, как у заказа, который уже выдан: запрос верный, но предмета
 * разговора больше нет. Страница по этому коду меняет форму на строку мёртвой ссылки — ту же,
 * что показала бы, открой человек ссылку минутой позже.
 */

const STATUS_MESSAGE = { 400: 'Bad Request', 409: 'Conflict' } as const;

const reject = (
  statusCode: 400 | 409,
  code: string,
  message: string,
  field: string | null = null,
): H3Error =>
  createError({
    statusCode,
    statusMessage: STATUS_MESSAGE[statusCode],
    message,
    data: field === null ? { code } : { code, field },
  });

/** Выпуск приглашения: имя или телефон не годятся. */
export const rejectInviteIssue = (code: InviteIssueDenialCode): H3Error =>
  reject(
    code === 'phone_taken' || code === 'driver_link_exists' ? 409 : 400,
    code,
    inviteIssueDenialText(code, WEB_LANGUAGE),
    INVITE_ISSUE_DENIAL_FIELDS[code],
  );

/** Принятие приглашения: ссылка умерла, пароль короток или телефон занят. */
export const rejectInviteAccept = (
  outcome: EmployeeInviteDeadOutcome | InviteAcceptDenialCode,
): H3Error => {
  if (outcome === 'password_too_short') {
    return reject(400, outcome, inviteAcceptDenialText(outcome, WEB_LANGUAGE), 'password');
  }

  if (outcome === 'phone_taken' || outcome === 'driver_link_exists') {
    return reject(409, outcome, inviteAcceptDenialText(outcome, WEB_LANGUAGE));
  }

  return reject(409, outcome, inviteDeadText(outcome, WEB_LANGUAGE));
};

/** Пароль по ссылке: ссылка умерла или пароль короток. */
export const rejectPasswordLink = (outcome: EmployeeAccessLinkDeadOutcome | 'password_too_short'): H3Error =>
  outcome === 'password_too_short'
    ? reject(400, outcome, passwordTooShortText(WEB_LANGUAGE), 'password')
    : reject(409, outcome, passwordLinkDeadText(outcome, WEB_LANGUAGE));

/**
 * Токен из пути. Пустой или длиннее разумного — сразу «не найдено»: хеш от мусора всё равно
 * ничего не найдёт, а строку в мегабайт хешировать незачем.
 */
export const readLinkToken = (value: unknown): string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : '';
