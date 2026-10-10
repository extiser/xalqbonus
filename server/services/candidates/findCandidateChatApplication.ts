import {
  type CandidateChatApplication,
  findLatestApplicationByTelegram,
} from '#server/repositories/candidateApplications';
import { findActiveLinkByChat } from '#server/repositories/programMembership';
import { isEmployeeTelegram } from '#server/services/employees/isEmployeeTelegram';

/**
 * Заявка, в тему которой идёт сообщение этого Telegram боту (issue #463). `null` — пишет
 * не кандидат, и сообщение уходит в обычное приветствие, как раньше.
 *
 * Не кандидат — участник программы, сотрудник или тот, у кого заявок нет вовсе. Участник
 * и сотрудник проверяются первыми: сообщения кандидата после «Оформлен» и «Отказ» идут
 * в тему его последней заявки, пока его Telegram не привязан к участнику и не принадлежит
 * сотруднику (docs/decisions.md → «Переписка с кандидатом»).
 *
 * Привязка ищется по чату: у перенесённых из старой базы заполнен только он, а в личной
 * переписке чат равен `from.id`.
 */
export const findCandidateChatApplication = async (
  telegramUserId: bigint,
): Promise<CandidateChatApplication | null> => {
  if (await findActiveLinkByChat(telegramUserId)) {
    return null;
  }

  if (await isEmployeeTelegram(telegramUserId)) {
    return null;
  }

  return findLatestApplicationByTelegram(telegramUserId);
};
