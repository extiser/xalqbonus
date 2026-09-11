import { getBotUsername } from '#server/adapters/telegram/botIdentity';
import type { EmployeeRole } from '#server/generated/prisma/enums';
import { readBotToken } from '#server/bot/config';
import { insertEmployeeInvite } from '#server/repositories/employeeInvites';
import { INVITE_LIFETIME_MS } from '#server/services/employees/config';
import {
  buildInviteLink,
  createInviteToken,
  hashInviteToken,
} from '#server/services/employees/inviteToken';
import { canInviteRole } from '#server/services/employees/roles';

/**
 * Выпуск приглашения сотрудника.
 *
 * Учётка здесь не заводится: она создаётся в момент принятия ссылки, и неиспользованное
 * приглашение не оставляет за собой мусорной учётки (docs/decisions.md → «Учётка
 * сотрудника и роли»).
 *
 * Ссылка возвращается один раз и больше не восстанавливается ниоткуда: в базе лежит
 * только хеш токена. Потерял — выпускается новая, старая отзывается.
 */

/** Приглашающий: то, что о нём знает проверка доступа. */
export type InviteActor = {
  employeeId: string;
  role: EmployeeRole;
};

export class RoleNotInvitableError extends Error {
  constructor(
    readonly actorRole: EmployeeRole,
    readonly invitedRole: EmployeeRole,
  ) {
    super(`роль ${actorRole} не может пригласить роль ${invitedRole}`);
    this.name = 'RoleNotInvitableError';
  }
}

/** Бота нет — некуда вести ссылке, и выпускать её бессмысленно. */
export class BotUnavailableError extends Error {
  constructor() {
    super('токен бота не задан: ссылку приглашения не на кого выписывать');
    this.name = 'BotUnavailableError';
  }
}

export type IssueInviteRequest = {
  actor: InviteActor;
  role: EmployeeRole;
  /** Момент выпуска. Аргументом — чтобы срок проверялся тестом, а не ожиданием двух суток. */
  now?: Date;
};

export type IssuedInvite = {
  inviteId: string;
  role: EmployeeRole;
  expiresAt: Date;
  /** Ссылка целиком. Второй раз её не отдаст никто, включая нас. */
  link: string;
};

export const issueInvite = async (request: IssueInviteRequest): Promise<IssuedInvite> => {
  const { actor, role } = request;

  // Правило «строго ниже своей» проверяется здесь, а не в ручке: ручка разбирает запрос
  // и зовёт сервис, а решение о правах — это правило (docs/principles.md → «Слои»).
  if (!canInviteRole(actor.role, role)) {
    throw new RoleNotInvitableError(actor.role, role);
  }

  const botToken = readBotToken();

  if (botToken === '') {
    throw new BotUnavailableError();
  }

  // Имя бота спрашивается до записи: приглашение, записанное в базу и оставшееся без
  // ссылки из-за молчащего Telegram, — это живой токен, которого никто не видел.
  const botUsername = await getBotUsername(botToken);
  const now = request.now ?? new Date();
  const inviteToken = createInviteToken();

  const invite = await insertEmployeeInvite({
    role,
    tokenHash: hashInviteToken(inviteToken),
    invitedById: actor.employeeId,
    expiresAt: new Date(now.getTime() + INVITE_LIFETIME_MS),
  });

  return {
    inviteId: invite.id,
    role: invite.role,
    expiresAt: invite.expiresAt,
    link: buildInviteLink(botUsername, inviteToken),
  };
};
