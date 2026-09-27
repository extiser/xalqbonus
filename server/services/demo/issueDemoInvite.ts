import { getBotUsername } from '#server/adapters/telegram/botIdentity';
import { readBotToken } from '#server/bot/config';
import { insertDemoInvite } from '#server/repositories/demoInvites';
import {
  buildDemoInviteLink,
  createDemoInviteToken,
  hashDemoInviteToken,
} from '#server/services/demo/demoInviteToken';
import { DEMO_INVITE_LIFETIME_MS } from '#server/services/employees/config';
import { BotUnavailableError } from '#server/services/employees/issueInvite';

/**
 * Выпуск приглашения в демо (issue #252) — по образцу приглашения сотрудника.
 *
 * Зритель здесь не заводится: он появляется в момент принятия, по `from.id` того, кто открыл
 * ссылку, — Telegram ID руками не вводится нигде. Токен лежит рядом с хешем, пока приглашение
 * живо: ссылку показывает и сводка раздела (решение Руслана 27-09-2026).
 */

export class DemoInviteLabelEmptyError extends Error {
  constructor() {
    super('подпись зрителя пуста');
    this.name = 'DemoInviteLabelEmptyError';
  }
}

export type IssueDemoInviteRequest = {
  label: string;
  invitedById: string;
  now?: Date;
};

export type IssuedDemoInvite = {
  inviteId: string;
  label: string;
  expiresAt: Date;
  /** Ссылка целиком. Пока приглашение живо, её отдаёт и сводка. */
  link: string;
};

export const issueDemoInvite = async (request: IssueDemoInviteRequest): Promise<IssuedDemoInvite> => {
  const label = request.label.trim();

  if (label === '') {
    throw new DemoInviteLabelEmptyError();
  }

  const botToken = readBotToken();

  if (botToken === '') {
    throw new BotUnavailableError();
  }

  // Имя бота — до записи: приглашение в базе без показанной ссылки — живой токен, которого
  // никто не видел.
  const botUsername = await getBotUsername(botToken);
  const now = request.now ?? new Date();
  const token = createDemoInviteToken();

  const invite = await insertDemoInvite({
    label,
    token,
    tokenHash: hashDemoInviteToken(token),
    invitedById: request.invitedById,
    expiresAt: new Date(now.getTime() + DEMO_INVITE_LIFETIME_MS),
  });

  return {
    inviteId: invite.id,
    label: invite.label,
    expiresAt: invite.expiresAt,
    link: buildDemoInviteLink(botUsername, token),
  };
};
