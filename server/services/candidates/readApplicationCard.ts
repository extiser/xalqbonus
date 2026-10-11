import { consola } from 'consola';

import type { EmployeeRole } from '#server/generated/prisma/enums';
import { enqueueCandidateRecheck } from '#server/queues/candidates';
import {
  findApplicationCard,
  findApplicationWaiting,
  findFirstTripAfterApplication,
  findLastPromoTouchBefore,
  findPromoLinkName,
  listApplicationEvents,
  listApplicationMessages,
} from '#server/repositories/candidateApplicationAdmin';
import { ApplicationDenialError } from '#server/services/candidates/applicationDenial';
import { readWaiting } from '#server/services/candidates/listApplications';
import { CANDIDATE_REPLY_ROLES } from '#shared/access';
import { formatPhone } from '#shared/phone';
import type { ApplicationCard } from '#shared/types/applications';

/**
 * Карточка заявки раздела «Заявки» (issue #471): кандидат, переписка из базы, журнал отметок,
 * сверка, откуда пришёл и ход заявки.
 *
 * Заявку, которую не удалось сверить при подаче, карточка ставит на пересверку в фоне и отвечает
 * тем, что есть: итог появится при следующем открытии. Постановка не удалась — строка в лог,
 * карточка всё равно открывается.
 */

const log = consola.withTag('candidates:card');

/** Приставка ID супергруппы в Bot API; в ссылке `t.me/c/…` её нет. */
const SUPERGROUP_PREFIX = '-100';

/** Ссылка на тему группы: `https://t.me/c/{группа без -100}/{тема}`. Нет темы — `null`. */
export const topicUrl = (forumChatId: bigint | null, forumTopicId: number | null): string | null => {
  if (forumChatId === null || forumTopicId === null) {
    return null;
  }

  const chatId = forumChatId.toString();
  const internalId = chatId.startsWith(SUPERGROUP_PREFIX) ? chatId.slice(SUPERGROUP_PREFIX.length) : chatId.replace(/^-/, '');

  return `https://t.me/c/${internalId}/${forumTopicId}`;
};

export const readApplicationCard = async (input: {
  applicationId: string;
  viewerRole: EmployeeRole;
}): Promise<ApplicationCard> => {
  const application = await findApplicationCard(input.applicationId);

  if (!application) {
    throw new ApplicationDenialError('application_not_found');
  }

  if (application.match === 'lookup_failed') {
    try {
      await enqueueCandidateRecheck(application.id);
    } catch (error) {
      log.warn('пересверка номера заявки не поставлена', {
        applicationId: application.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const [waiting, messages, events, promoName, touchedAt, firstTripAt] = await Promise.all([
    findApplicationWaiting(application.id),
    listApplicationMessages(application.id),
    listApplicationEvents(application.id),
    findPromoLinkName(application.promoCode),
    findLastPromoTouchBefore(application.promoCode, application.telegramUserId, application.createdAt),
    findFirstTripAfterApplication(application.telegramUserId, application.createdAt),
  ]);

  // Первый ответ — самое раннее из доставленных сообщений сотрудника и отметок: отметка тоже
  // ответ (docs/decisions.md → «Заявки в админке»).
  const replies = [
    ...messages
      .filter((message) => message.author === 'employee' && message.delivery === 'delivered')
      .map((message) => ({ at: message.createdAt, employeeName: message.employee?.fullName ?? '' })),
    ...events.map((event) => ({ at: event.createdAt, employeeName: event.employee.fullName })),
  ].sort((left, right) => left.at.getTime() - right.at.getTime());
  const firstReply = replies[0];

  return {
    application: {
      id: application.id,
      name: application.name,
      phone: formatPhone(application.phoneE164).display,
      phoneManual: application.phoneSource === 'manual',
      telegramUserId: application.telegramUserId.toString(),
      telegramName: application.telegramName,
      telegramUsername: application.telegramUsername,
      writeAllowed: application.writeAllowed,
      status: application.status,
      channel: application.channel,
      createdAt: application.createdAt.toISOString(),
      handledBy: application.handledByEmployee?.fullName ?? null,
      ...(waiting === null ? { waitingSince: null, waitingFrom: null } : readWaiting(waiting)),
    },
    match: {
      match: application.match,
      // Колонка `date`: Prisma отдаёт её полночью UTC, и день — первые десять знаков.
      lastTripDay: application.lastTripDay === null ? null : application.lastTripDay.toISOString().slice(0, 10),
      matchedPersonId: application.matchedPersonId,
      formerLinkPersonId: application.formerLinkPersonId,
    },
    source: {
      promoCode: application.promoCode,
      promoName,
      touchedAt: touchedAt?.toISOString() ?? null,
    },
    topicUrl: topicUrl(application.forumChatId, application.forumTopicId),
    messages: messages.map((message) => ({
      id: message.id,
      author: message.author,
      authorName: message.author === 'employee' ? (message.employee?.fullName ?? null) : null,
      kind: message.kind,
      text: message.text,
      delivery: message.delivery,
      failure: message.failure,
      createdAt: message.createdAt.toISOString(),
    })),
    events: events.map((event) => ({
      kind: event.kind,
      employeeName: event.employee.fullName,
      createdAt: event.createdAt.toISOString(),
    })),
    firstReply: firstReply === undefined ? null : { at: firstReply.at.toISOString(), employeeName: firstReply.employeeName },
    firstTrip: firstTripAt === null ? null : { at: firstTripAt.toISOString() },
    canReply: CANDIDATE_REPLY_ROLES.includes(input.viewerRole),
  };
};
