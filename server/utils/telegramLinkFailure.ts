// `createError` берётся из `h3` явно, а не автоимпортом: в общем пространстве имён имя занято
// обёрткой Nuxt, у которой номер ответа необязателен (`denial.ts`).
import { createError, type H3Error } from 'h3';

import {
  TelegramLinkedToOtherError,
  TelegramLinkError,
  UnknownDriverError,
  type TelegramLinkErrorCode,
} from '#server/services/drivers/telegramLinkErrors';
import type { DriverTelegramOtherDriver } from '#shared/types/driver';

/**
 * Отказы привязки и отвязки Telegram из карточки водителя в ответе HTTP (issue #305).
 *
 * Одни на три ручки — проверку кандидата, привязку и отвязку: три копии «С этого Telegram
 * водитель не делился номером» разошлись бы формулировкой на первой правке. Отказы доменные,
 * поэтому текст при своём правиле, а не в словаре двери (docs/decisions.md → «Отказ двери веба
 * говорит кодом, а текст живёт словарём»); код — в `data.code`, по нему решает экран.
 *
 * `null` — не отказ, а поломка: такое уходит пятисоткой.
 */

const MESSAGES: Readonly<Record<Exclude<TelegramLinkErrorCode, 'linked_to_other'>, string>> = {
  driver_demo: 'Привязки демо-водителя меняются в разделе «Демо».',
  not_member: 'Водитель не в программе: привязка появляется, когда он сам открывает бота.',
  no_attempt:
    'С этого Telegram водитель не делился номером. Попросите его открыть бота с нового телефона и нажать «Поделиться номером», затем повторите.',
  employee_account: 'Этот Telegram принадлежит сотруднику парка — привязать его водителю нельзя.',
  already_active: 'Этот Telegram уже привязан к водителю.',
  no_active_link: 'Действующей привязки нет — отвязывать нечего.',
};

const linkedToOtherMessage = (other: DriverTelegramOtherDriver): string =>
  `Этот Telegram привязан к другому водителю: ${other.fullName}${
    other.callsign === null ? '' : `, позывной ${other.callsign}`
  }. Сначала отвяжите его в карточке того водителя.`;

export const explainTelegramLinkFailure = (error: unknown): H3Error | null => {
  // Как у карточки водителя: такого человека в реестре нет.
  if (error instanceof UnknownDriverError) {
    return createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'человека с таким идентификатором в реестре нет',
    });
  }

  if (error instanceof TelegramLinkedToOtherError) {
    return createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: linkedToOtherMessage(error.other),
      data: { code: error.code, ...error.other },
    });
  }

  if (error instanceof TelegramLinkError) {
    return createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: MESSAGES[error.code as Exclude<TelegramLinkErrorCode, 'linked_to_other'>],
      data: { code: error.code },
    });
  }

  return null;
};

/** Предел `bigint` Postgres: число больше не приведётся к колонке и уронило бы запрос. */
const BIGINT_MAX = 9_223_372_036_854_775_807n;

/**
 * Telegram ID из ввода сотрудника или отказ `400` — до обращения к базе.
 *
 * Положительное целое не длиннее 20 цифр и не больше предела `bigint`: всё прочее — опечатка,
 * и искать по ней попытку незачем.
 */
export const requireTelegramId = (value: unknown): bigint => {
  const raw = typeof value === 'string' ? value.trim() : '';
  const parsed = /^\d{1,20}$/.test(raw) ? BigInt(raw) : 0n;

  if (parsed <= 0n || parsed > BIGINT_MAX) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Telegram ID — только цифры.',
    });
  }

  return parsed;
};
