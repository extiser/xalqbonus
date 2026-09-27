import { consola } from 'consola';

import { db } from '#server/db';
import { lockDemoInviteByTokenHash, markDemoInviteAccepted } from '#server/repositories/demoInvites';
import { addDemoViewerWithin } from '#server/services/demo/addDemoViewer';
import { NoDemoSourceError } from '#server/services/demo/createDemoDriver';
import { hashDemoInviteToken } from '#server/services/demo/demoInviteToken';
import { getSystemAccount } from '#server/services/points/getSystemAccount';

/**
 * Принятие приглашения в демо (issue #252): `/start demo_<токен>` делает открывшего
 * демо-зрителем. Личность — `from.id` подписанного апдейта, контакт не нужен: у зрителя нет
 * учётки с логином, которой телефон служил бы.
 *
 * Одной транзакцией с блокировкой строки приглашения: два одновременных открытия одной
 * ссылки идут друг за другом, и второй видит её принятой.
 *
 * Отказ внесения — Telegram живого водителя или сотрудника, копировать не с кого — ссылку
 * не гасит: владелец перешлёт её тому, кому она предназначалась.
 */
const log = consola.withTag('demo:invite');

export type AcceptDemoInviteOutcome =
  | 'accepted'
  | 'invite_unknown'
  | 'invite_used'
  | 'invite_revoked'
  | 'invite_expired'
  | 'telegram_linked'
  | 'telegram_employee'
  | 'no_source';

export type AcceptDemoInviteRequest = {
  token: string;
  telegramUserId: bigint;
  now?: Date;
};

export type AcceptDemoInviteResult =
  | { outcome: 'accepted'; personId: string }
  | { outcome: Exclude<AcceptDemoInviteOutcome, 'accepted'> };

export const acceptDemoInvite = async (request: AcceptDemoInviteRequest): Promise<AcceptDemoInviteResult> => {
  const now = request.now ?? new Date();
  const tokenHash = hashDemoInviteToken(request.token);
  const emission = await getSystemAccount('emission');

  try {
    const result = await db.$transaction(async (transaction): Promise<AcceptDemoInviteResult> => {
      const invite = await lockDemoInviteByTokenHash(tokenHash, transaction);

      if (!invite) {
        return { outcome: 'invite_unknown' };
      }

      if (invite.acceptedAt !== null) {
        return { outcome: 'invite_used' };
      }

      if (invite.revokedAt !== null) {
        return { outcome: 'invite_revoked' };
      }

      if (invite.expiresAt <= now) {
        return { outcome: 'invite_expired' };
      }

      const added = await addDemoViewerWithin(transaction, {
        telegramUserId: request.telegramUserId,
        label: invite.label,
        now,
        emissionAccountId: emission.id,
      });

      if (!('personId' in added)) {
        return { outcome: added.outcome };
      }

      await markDemoInviteAccepted(invite.id, request.telegramUserId, now, transaction);

      log.info('приглашение в демо принято', {
        inviteId: invite.id,
        telegramUserId: request.telegramUserId.toString(),
        viewerOutcome: added.outcome,
        personId: added.personId,
      });

      return { outcome: 'accepted', personId: added.personId };
    });

    return result;
  } catch (error) {
    // Транзакция откатилась целиком — приглашение осталось живым.
    if (error instanceof NoDemoSourceError) {
      return { outcome: 'no_source' };
    }

    throw error;
  }
};
