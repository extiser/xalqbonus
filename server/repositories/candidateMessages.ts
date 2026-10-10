import { db } from '#server/db';
import type {
  CandidateMessageAuthor,
  CandidateMessageFailure,
  CandidateMessageKind,
} from '#server/generated/prisma/enums';

/**
 * Переписка с кандидатом (issue #463): сообщения в обе стороны и приветствие бота.
 *
 * Строка пишется `pending` до отправки и закрывается исходом после неё — так админка видит
 * и то, что не ушло (docs/decisions.md → «Переписка с кандидатом»).
 *
 * Схема в сыром SQL указывается явно: у соединения драйверного адаптера `search_path`
 * дефолтный, и запрос без префикса молча ушёл бы в `public` (docs/decisions.md).
 */

export type CandidateMessageInput = {
  applicationId: string;
  author: CandidateMessageAuthor;
  /** Заполнен ровно у `author = 'employee'`. */
  employeeId: string | null;
  kind: CandidateMessageKind;
  text: string | null;
  fileId: string | null;
  candidateMessageId: number | null;
  topicMessageId: number | null;
};

/**
 * Заводит строку `pending`. `null` — вставку отбил частичный уникальный индекс: это повтор
 * того же апдейта, и сообщение второй раз не отправляется.
 *
 * Сырым запросом ради `ON CONFLICT DO NOTHING` без цели: индексы частичные, по автору,
 * и типизированный API Prisma выразил бы отказ индекса исключением, а повтор апдейта —
 * не ошибка, а обычный исход.
 */
export const insertCandidateMessage = async (input: CandidateMessageInput): Promise<string | null> => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO xb.candidate_messages (
      "application_id", "author", "employee_id", "kind", "text", "file_id",
      "candidate_message_id", "topic_message_id", "delivery"
    )
    VALUES (
      ${input.applicationId}::uuid,
      ${input.author}::xb.candidate_message_author,
      ${input.employeeId}::uuid,
      ${input.kind}::xb.candidate_message_kind,
      ${input.text},
      ${input.fileId},
      ${input.candidateMessageId}::int,
      ${input.topicMessageId}::int,
      'pending'::xb.candidate_message_delivery
    )
    ON CONFLICT DO NOTHING
    RETURNING "id"
  `;

  return rows[0]?.id ?? null;
};

/** Доставлено: сообщение в личке кандидата или копия в теме — что появилось. */
export const markCandidateMessageDelivered = async (
  messageId: string,
  delivered: { candidateMessageId?: number; topicMessageId?: number },
): Promise<void> => {
  await db.candidateMessage.update({
    where: { id: messageId },
    data: { delivery: 'delivered', ...delivered },
  });
};

/** Не доставлено: отправка не прошла (`failed`) или бот отказался слать (`refused`). */
export const markCandidateMessageUndelivered = async (
  messageId: string,
  delivery: 'failed' | 'refused',
  failure: CandidateMessageFailure,
): Promise<void> => {
  await db.candidateMessage.update({
    where: { id: messageId },
    data: { delivery, failure },
  });
};

/**
 * Убирает строку `pending`, отправка которой упала сбоем и будет повторена заданием: иначе
 * повтор нашёл бы приветствие уже заведённым и пропустил его.
 */
export const deleteCandidateMessage = async (messageId: string): Promise<void> => {
  await db.candidateMessage.delete({ where: { id: messageId } });
};

/** Есть ли у заявки сообщение бота — приветствие, отправленное или нет. */
export const hasBotCandidateMessage = async (applicationId: string): Promise<boolean> =>
  (await db.candidateMessage.count({ where: { applicationId, author: 'bot' } })) > 0;

/**
 * Ответ сотрудника доставлен — и вместе с этим, одной транзакцией, заявка «Новая» уходит
 * «В работу», а ведущим становится ответивший, если ведущего ещё нет. Ответ после «Оформлен»
 * и «Отказ» статус не меняет: вернуть заявку в работу — решение админки.
 */
export const markEmployeeReplyDelivered = async (input: {
  messageId: string;
  candidateMessageId: number;
  applicationId: string;
  employeeId: string;
}): Promise<void> => {
  await db.$transaction([
    db.candidateMessage.update({
      where: { id: input.messageId },
      data: { delivery: 'delivered', candidateMessageId: input.candidateMessageId },
    }),
    db.candidateApplication.updateMany({
      where: { id: input.applicationId, status: 'new' },
      data: { status: 'in_progress' },
    }),
    db.candidateApplication.updateMany({
      where: { id: input.applicationId, handledByEmployeeId: null },
      data: { handledByEmployeeId: input.employeeId },
    }),
  ]);
};
