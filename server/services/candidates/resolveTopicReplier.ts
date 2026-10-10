import type { Message } from 'grammy/types';

import { findEmployeeByTelegramUserId } from '#server/repositories/employees';

/**
 * Кто отвечает кандидату из темы группы (issue #463). Кандидату пишет только сотрудник
 * с привязанным Telegram: ответивший первым становится ведущим заявки (docs/decisions.md →
 * «Переписка с кандидатом»).
 *
 * `null` — не сотрудник, и сообщение кандидату не уходит:
 *
 * - у сообщения есть `sender_chat` — пишет анонимный администратор или канал: `from` у такого
 *   сообщения подставной, и чья это реплика, не знает никто;
 * - Telegram отправителя не привязан ни к одной учётке;
 * - учётка выключена: выключение действует немедленно, и ответ кандидату — тоже доступ;
 * - учётка демо: от её имени кандидату не пишет никто.
 */

export type TopicReplier = {
  employeeId: string;
};

export const resolveTopicReplier = async (message: Message): Promise<TopicReplier | null> => {
  if (message.sender_chat !== undefined || message.from === undefined) {
    return null;
  }

  const employee = await findEmployeeByTelegramUserId(BigInt(message.from.id));

  if (!employee || employee.disabledAt !== null || employee.isDemo) {
    return null;
  }

  return { employeeId: employee.id };
};
