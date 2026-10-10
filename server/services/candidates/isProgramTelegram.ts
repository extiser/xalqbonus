import { findActiveLinkByChat } from '#server/repositories/programMembership';
import { isEmployeeTelegram } from '#server/services/employees/isEmployeeTelegram';

/**
 * Этот Telegram — участник программы или сотрудник (issue #467): заявку в чате он не подаёт и
 * получает своё обычное приветствие. Привязка ищется по чату: у перенесённых из старой базы
 * заполнен только он, а в личной переписке чат равен `from.id`.
 */
export const isProgramTelegram = async (telegramUserId: bigint): Promise<boolean> =>
  (await findActiveLinkByChat(telegramUserId)) !== null || (await isEmployeeTelegram(telegramUserId));
