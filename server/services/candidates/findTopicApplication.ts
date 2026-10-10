import {
  type CandidateChatApplication,
  findApplicationByTopic,
} from '#server/repositories/candidateApplications';

/**
 * Заявка темы группы сотрудников (issue #463) — по группе и `message_thread_id` сообщения.
 *
 * Тема кандидата узнаётся только так: `reply_to_message` у каждого сообщения темы указывает
 * на служебное сообщение её создания, даже если «Ответить» не нажимали (docs/decisions.md →
 * «Переписка с кандидатом»). `null` — тема не наша: её завели руками.
 */
export const findTopicApplication = async (
  forumChatId: bigint,
  forumTopicId: number,
): Promise<CandidateChatApplication | null> => findApplicationByTopic(forumChatId, forumTopicId);
