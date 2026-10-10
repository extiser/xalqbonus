import { consola } from 'consola';

import { readMiniAppOrigin } from '#server/bot/config';
import { plainText, text } from '#server/bot/texts';
import { enqueueCandidateTopic } from '#server/queues/candidates';
import {
  type CandidateApplicationRow,
  findOpenApplicationByPhone,
  findOpenApplicationByTelegram,
  insertCandidateApplication,
} from '#server/repositories/candidateApplications';
import { type CandidateChatDraftRow, closeChatDraft } from '#server/repositories/candidateChatDrafts';
import {
  deleteCandidateMessage,
  insertCandidateMessage,
  markCandidateMessageDelivered,
} from '#server/repositories/candidateMessages';
import { findLastClosedLinkPerson } from '#server/repositories/programMembership';
import { type ChatDraftReply, REMOVE_KEYBOARD, repeatText } from '#server/services/candidates/chatDraftReplies';
import { reconcileCandidatePhone } from '#server/services/candidates/reconcileCandidatePhone';

/**
 * Заявка кандидата из чата бота (issue #467) — по образцу заявки из Mini App
 * (`submitCandidateApplication`): та же сверка номера, те же индексы открытой заявки, та же тема
 * в группе сотрудников. Номер — из контакта, подтверждённого Telegram, имя — из сообщения.
 *
 * «Заявка принята» здесь — оно же приветствие кандидату в переписке: строка бота пишется до
 * отправки, и задание темы второго приветствия не шлёт (`openCandidateTopic` → `ensureGreeting`).
 */

const log = consola.withTag('candidates:chat');

/** Причина отказа для строки лога. */
const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Черновик на шаге имени — номер в нём уже есть. */
export type NamedChatDraft = CandidateChatDraftRow & { phoneRaw: string; phoneE164: string };

export type SubmitChatApplicationInput = {
  draft: NamedChatDraft;
  telegramUserId: bigint;
  telegramChatId: bigint;
  telegramName: string;
  telegramUsername: string | null;
  /** Имя из сообщения, уже проверенное `readCandidateName`. */
  name: string;
  now: Date;
  reply: ChatDraftReply;
};

export type SubmitChatApplicationOutcome = 'accepted' | 'repeat' | 'failed';

type Recorded = { outcome: 'accepted' | 'repeat'; application: CandidateApplicationRow };

/** Открытая заявка этого Telegram, иначе — этого номера, подтверждённого Telegram. */
const findOpen = async (input: SubmitChatApplicationInput): Promise<CandidateApplicationRow | null> =>
  (await findOpenApplicationByTelegram(input.telegramUserId)) ??
  (await findOpenApplicationByPhone(input.draft.phoneE164));

/** Шаги 1–4: открытая заявка или новая, и черновик закрывается ею. */
const recordApplication = async (input: SubmitChatApplicationInput): Promise<Recorded> => {
  const { draft } = input;
  const open = await findOpen(input);

  if (open) {
    await closeChatDraft(draft.id, open.id);

    return { outcome: 'repeat', application: open };
  }

  const [reconciliation, formerLinkPersonId] = await Promise.all([
    reconcileCandidatePhone(draft.phoneE164, input.now),
    findLastClosedLinkPerson(input.telegramUserId),
  ]);

  const inserted = await insertCandidateApplication({
    channel: 'bot',
    telegramUserId: input.telegramUserId,
    telegramChatId: input.telegramChatId,
    telegramName: input.telegramName,
    telegramUsername: input.telegramUsername,
    name: input.name,
    phoneRaw: draft.phoneRaw,
    phoneE164: draft.phoneE164,
    phoneSource: 'telegram_contact',
    // Кандидат сам написал боту: писать ему можно.
    writeAllowed: true,
    language: draft.language,
    promoCode: draft.promoCode,
    match: reconciliation.match,
    matchedPersonId: reconciliation.personId,
    matchedProfileId: reconciliation.profileId,
    lastTripDay: reconciliation.lastTripDay,
    formerLinkPersonId,
  });

  if (inserted) {
    await closeChatDraft(draft.id, inserted.id);

    log.info('заявка кандидата из чата', {
      applicationId: inserted.id,
      promoCode: draft.promoCode,
      match: reconciliation.match,
    });

    return { outcome: 'accepted', application: inserted };
  }

  // Вставку отбил индекс открытой заявки: её успели подать в Mini App. Ответ — та заявка.
  const raced = await findOpen(input);

  if (!raced) {
    throw new Error('вставку заявки отбил индекс открытой заявки, а открытой заявки нет');
  }

  await closeChatDraft(draft.id, raced.id);

  return { outcome: 'repeat', application: raced };
};

/**
 * «Заявка принята» — приветствие кандидату: строка бота `pending`, отправка, `delivered`.
 *
 * Отправка не прошла — строка удаляется, и задание темы пошлёт своё приветствие
 * (`candidate_greeting`): без строки бота оно шаг не пропускает. Строку не записать — то же самое:
 * своего ответа нет, приветствие уйдёт заданием.
 */
const greetCandidate = async (input: SubmitChatApplicationInput, application: CandidateApplicationRow): Promise<void> => {
  const values = { name: application.name };
  let messageId: string | null;

  // У сообщений бота уникального индекса нет, и вставка отбиться не может: `null` здесь —
  // тот же сбой записи, что исключение.
  try {
    messageId = await insertCandidateMessage({
      applicationId: application.id,
      author: 'bot',
      employeeId: null,
      kind: 'text',
      text: plainText('application_chat_accepted', application.language, values),
      fileId: null,
      candidateMessageId: null,
      topicMessageId: null,
    });
  } catch (error) {
    messageId = null;

    log.error('строка «заявка принята» не записана', { applicationId: application.id, error: reasonOf(error) });
  }

  if (messageId === null) {
    log.warn('«заявка принята» не отправлена — приветствие уйдёт заданием темы', { applicationId: application.id });

    return;
  }

  let candidateMessageId: number;

  try {
    candidateMessageId = await input.reply(text('application_chat_accepted', application.language, values), null);
  } catch (error) {
    await deleteCandidateMessage(messageId);

    log.warn('«заявка принята» не отправлена — приветствие уйдёт заданием темы', {
      applicationId: application.id,
      error: reasonOf(error),
    });

    return;
  }

  await markCandidateMessageDelivered(messageId, { candidateMessageId });
};

export const submitChatApplication = async (
  input: SubmitChatApplicationInput,
): Promise<SubmitChatApplicationOutcome> => {
  let recorded: Recorded;

  try {
    recorded = await recordApplication(input);
  } catch (error) {
    // Черновик остаётся незаконченным: `/start` начнёт его заново по той же метке.
    log.error('заявка кандидата из чата не записана', { draftId: input.draft.id, error: reasonOf(error) });

    await input.reply(text('application_chat_failed', input.draft.language), null);

    return 'failed';
  }

  const { outcome, application } = recorded;

  if (outcome === 'repeat') {
    await input.reply(repeatText(application, input.draft.language, input.now), REMOVE_KEYBOARD);

    return 'repeat';
  }

  await greetCandidate(input, application);

  // Тема в группе и карточка — после приветствия: задание должно видеть его строку. Постановка
  // упала — кандидат ответ уже получил, а заявка будет в админке.
  try {
    await enqueueCandidateTopic({ applicationId: application.id, appOrigin: readMiniAppOrigin() });
  } catch (error) {
    log.error('тема заявки кандидата не поставлена в очередь', {
      applicationId: application.id,
      error: reasonOf(error),
    });
  }

  return 'accepted';
};
