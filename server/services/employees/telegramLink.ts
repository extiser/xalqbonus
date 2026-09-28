import { consola } from 'consola';

import { getBotUsername } from '#server/adapters/telegram/botIdentity';
import { readBotToken } from '#server/bot/config';
import { db } from '#server/db';
import { findEmployeeById, lockEmployeeById } from '#server/repositories/employees';
import { BotUnavailableError } from '#server/services/employees/botUnavailableError';
import { TELEGRAM_LINK_LIFETIME_MS } from '#server/services/employees/config';
import { buildTelegramBindLink } from '#server/services/employees/employeeLinks';
import { issueAccessLinkWithin } from '#server/services/employees/issueAccessLink';
import { canManageEmployee, type EmployeeActor } from '#server/services/employees/roles';
// Относительным путём, а не через `#shared`: значение, а не тип, и модуль читают тесты,
// у которых из псевдонимов настроен один `#server` — как в `readEmployeeAccounts.ts`.
import { canEditDemo } from '../../../shared/access';

/**
 * Ссылка привязки Telegram к учётке сотрудника (issue #267).
 *
 * Выпускает её прежде всего руководитель — из строки учётки в «Сотрудниках» — и пересылает
 * человеку, как приглашение и ссылку «задать пароль»: сотрудник, которому не дали готовое,
 * привязку не сделает. Себе ссылку выпускает каждый — из своей строки и на шаге сразу после
 * принятия приглашения: у владельца руководителя нет (docs/decisions.md → «Ссылка приглашения
 * видна, пока жива; сотрудник принимает приглашение в вебе»).
 *
 * Ссылка ведёт в бота, а `telegram_user_id` бот берёт из подписанного апдейта — руками он
 * не вводится нигде.
 */

const log = consola.withTag('employees:telegram');

/** Учётка, о которой спрашивают право: кто она, какой роли и не демо ли. */
export type TelegramLinkTarget = {
  employeeId: string;
  role: EmployeeActor['role'];
  isDemo: boolean;
};

/**
 * Вправе ли действующий выпустить ссылку этой учётке: своей — всегда, чужой — если вправе
 * сбросить ей пароль (`manageable` в `readEmployeeAccounts.ts`). Демо здесь не отсекается:
 * у демо-учётки свой отказ, `demo_account`, а в списке у неё нет кнопки.
 */
export const canIssueTelegramLink = (actor: EmployeeActor, target: TelegramLinkTarget): boolean =>
  actor.employeeId === target.employeeId ||
  (canManageEmployee(actor.role, target.role) && canEditDemo(actor.role, target.isDemo));

/** Имя бота или отказ. Спрашивается до записи: ссылка без бота — живой токен, которого никто не увидит. */
const readBotUsername = async (): Promise<string> => {
  const botToken = readBotToken();

  if (botToken === '') {
    throw new BotUnavailableError();
  }

  return getBotUsername(botToken);
};

/**
 * Ссылка из живого токена — для списка сотрудников. Бота нет — `null`: собрать ссылку не из чего,
 * а список от этого ломаться не должен.
 */
export const buildLiveTelegramLink = async (token: string): Promise<string | null> =>
  readBotToken() === '' ? null : buildTelegramBindLink(await readBotUsername(), token);

export type IssueTelegramLinkRequest = {
  actor: EmployeeActor;
  employeeId: string;
  now?: Date;
};

// Каждый исход отдельным членом объединения: объединённый литерал перестаёт быть различителем,
// и проверка `outcome === ...` у ручки тип больше не сужает (как в `loginByPassword.ts`).
export type IssueTelegramLinkTokenResult =
  | { outcome: 'issued'; token: string; expiresAt: Date }
  /** Telegram у учётки уже есть. Отвязки пока нет, и вторая ссылка ничего бы не дала. */
  | { outcome: 'bound' }
  /** Учётки с таким идентификатором нет. */
  | { outcome: 'not_found' }
  /** Чужая учётка роли не ниже своей. */
  | { outcome: 'forbidden' }
  /** Демо-учётка: своего входа у неё нет (`employees_demo_no_login_check`). */
  | { outcome: 'demo_account' };

/**
 * Право и выпуск — без бота: отзывает живую ссылку привязки этой учётки и выпускает новую,
 * `issued_by_id` — действующий. Ссылка у учётки одна, и рабочая — та, что выпущена последней.
 *
 * Отдельно от `issueTelegramLink`, которая собирает из токена ссылку на бота: сюда не нужен
 * Telegram, и правило проверяется тестом без сети.
 */
export const issueTelegramLinkToken = async (
  request: IssueTelegramLinkRequest,
): Promise<IssueTelegramLinkTokenResult> => {
  const employee = await findEmployeeById(request.employeeId);

  if (!employee) {
    return { outcome: 'not_found' };
  }

  if (!canIssueTelegramLink(request.actor, { employeeId: employee.id, role: employee.role, isDemo: employee.isDemo })) {
    return { outcome: 'forbidden' };
  }

  if (employee.isDemo) {
    return { outcome: 'demo_account' };
  }

  const now = request.now ?? new Date();

  const issued = await db.$transaction(async (transaction) => {
    // Строка учётки под блокировкой: две одновременные кнопки выпускают ссылки по очереди,
    // и вторая отзывает первую, а не упирается в индекс открытых ссылок.
    const locked = await lockEmployeeById(employee.id, transaction);

    if (!locked || locked.telegramUserId !== null) {
      return null;
    }

    return issueAccessLinkWithin(transaction, {
      employeeId: employee.id,
      kind: 'telegram',
      issuedById: request.actor.employeeId,
      lifetimeMs: TELEGRAM_LINK_LIFETIME_MS,
      now,
    });
  });

  if (!issued) {
    return { outcome: 'bound' };
  }

  log.info('ссылка привязки Telegram выпущена', {
    employeeId: employee.id,
    actorEmployeeId: request.actor.employeeId,
  });

  return { outcome: 'issued', token: issued.token, expiresAt: issued.expiresAt };
};

export type IssueTelegramLinkResult =
  | { outcome: 'issued'; url: string; expiresAt: Date }
  | Exclude<IssueTelegramLinkTokenResult, { outcome: 'issued' }>;

/**
 * Выпускает ссылку привязки и собирает её на бота. Бота нет — `BotUnavailableError` до всякой
 * записи: страница приглашения по нему пропускает шаг привязки, список — показывает отказ.
 */
export const issueTelegramLink = async (request: IssueTelegramLinkRequest): Promise<IssueTelegramLinkResult> => {
  const botUsername = await readBotUsername();
  const result = await issueTelegramLinkToken(request);

  if (result.outcome !== 'issued') {
    return result;
  }

  return { outcome: 'issued', url: buildTelegramBindLink(botUsername, result.token), expiresAt: result.expiresAt };
};
