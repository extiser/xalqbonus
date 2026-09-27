import { consola } from 'consola';

import { getBotUsername } from '#server/adapters/telegram/botIdentity';
import { readBotToken } from '#server/bot/config';
import { db } from '#server/db';
import { findLiveAccessLink } from '#server/repositories/employeeAccessLinks';
import { findEmployeeById, lockEmployeeById } from '#server/repositories/employees';
import { BotUnavailableError } from '#server/services/employees/botUnavailableError';
import { TELEGRAM_LINK_LIFETIME_MS } from '#server/services/employees/config';
import { buildTelegramBindLink } from '#server/services/employees/employeeLinks';
import { issueAccessLinkWithin } from '#server/services/employees/issueAccessLink';

/**
 * Ссылка привязки Telegram, которую вошедший в веб сотрудник выпускает себе сам (issue #267).
 *
 * Telegram привязывается потом и по желанию: приглашение принимается в вебе, и учётка
 * рождается без него. Ссылка ведёт в бота, а `telegram_user_id` бот берёт из подписанного
 * апдейта — руками он не вводится нигде (docs/decisions.md → «Ссылка приглашения видна, пока
 * жива; сотрудник принимает приглашение в вебе»).
 */

const log = consola.withTag('employees:telegram');

/** Имя бота или отказ. Спрашивается до записи: ссылка без бота — живой токен, которого никто не увидит. */
const readBotUsername = async (): Promise<string> => {
  const botToken = readBotToken();

  if (botToken === '') {
    throw new BotUnavailableError();
  }

  return getBotUsername(botToken);
};

export type TelegramLinkState = {
  /** Telegram у учётки есть — ссылка не нужна. */
  bound: boolean;
  /** Живая ссылка, если сотрудник её уже выпускал. */
  link: { url: string; expiresAt: Date } | null;
};

/**
 * Состояние для страницы `/password`: привязан ли Telegram и живая ли ссылка есть — она
 * показывается при повторном открытии страницы.
 *
 * Бота нет — ссылки тоже нет: собрать её не из чего, а ответ страницы от этого ломаться не должен.
 */
export const readTelegramLink = async (employeeId: string, now: Date = new Date()): Promise<TelegramLinkState> => {
  const employee = await findEmployeeById(employeeId);

  if (!employee || employee.telegramUserId !== null) {
    return { bound: employee !== null, link: null };
  }

  const live = await findLiveAccessLink(employeeId, 'telegram', now);

  if (!live || readBotToken() === '') {
    return { bound: false, link: null };
  }

  return {
    bound: false,
    link: { url: buildTelegramBindLink(await readBotUsername(), live.token), expiresAt: live.expiresAt },
  };
};

export type IssueTelegramLinkResult =
  | { outcome: 'issued'; url: string; expiresAt: Date }
  /** Telegram у учётки уже есть. Отвязки пока нет, и вторая ссылка ничего бы не дала. */
  | { outcome: 'already_bound' };

/**
 * Выпускает новую ссылку привязки, отзывая живую: ссылка у учётки одна, и та, что показана
 * последней, — единственная рабочая.
 */
export const issueTelegramLink = async (
  employeeId: string,
  now: Date = new Date(),
): Promise<IssueTelegramLinkResult> => {
  const botUsername = await readBotUsername();

  const issued = await db.$transaction(async (transaction) => {
    const employee = await lockEmployeeById(employeeId, transaction);

    if (!employee) {
      throw new Error(`учётки ${employeeId} нет, а сессия на неё есть`);
    }

    if (employee.telegramUserId !== null) {
      return null;
    }

    return issueAccessLinkWithin(transaction, {
      employeeId,
      kind: 'telegram',
      issuedById: employeeId,
      lifetimeMs: TELEGRAM_LINK_LIFETIME_MS,
      now,
    });
  });

  if (!issued) {
    return { outcome: 'already_bound' };
  }

  log.info('ссылка привязки Telegram выпущена', { employeeId });

  return { outcome: 'issued', url: buildTelegramBindLink(botUsername, issued.token), expiresAt: issued.expiresAt };
};
