import type { Prisma } from '#server/generated/prisma/client';
import { findDriverListName, findPersonTelegramState } from '#server/repositories/drivers';
import { findEmployeeByTelegramUserId } from '#server/repositories/employees';
import {
  findActiveLinkByChat,
  findActiveLinkByPerson,
  type ActiveTelegramLinkRow,
} from '#server/repositories/programMembership';
import { findRelinkAttempt, type RelinkAttemptRow } from '#server/repositories/telegramLinkAttempts';
import {
  DriverDemoError,
  DriverNotMemberError,
  RelinkAttemptMissingError,
  TelegramAlreadyActiveError,
  TelegramLinkedToOtherError,
  TelegramOfEmployeeError,
  UnknownDriverError,
  type OtherDriver,
} from '#server/services/drivers/telegramLinkErrors';
import type { DriverTelegramCandidateResponse } from '#shared/types/driver';

/**
 * Проверка Telegram перед привязкой из карточки водителя (issue #305).
 *
 * Защита — попытка привязки, а не роль: привязать можно только Telegram, с которого этот
 * водитель за последние 30 дней делился номером в боте, и номер сошёлся с его номером в парке.
 * Вбитый сотрудником ID лишь выбирает такую строку `telegram_link_attempts`, а чат новой
 * привязки берётся из неё (docs/drivers.md → «Перепривязка — операция, а не побочный эффект»).
 *
 * Проверки одни на показ диалога и на саму привязку: `relinkTelegram` зовёт `resolveRelinkCandidate`
 * в своей транзакции, под блокировкой человека, и между диалогом и нажатием «Привязать»
 * ничего не проскакивает мимо них.
 */

export type RelinkCandidate = {
  attempt: RelinkAttemptRow;
  /** Действующая привязка человека — её закроет привязка. Пусто — закрывать нечего. */
  currentLink: ActiveTelegramLinkRow | null;
};

/** Имя так, как его показывает строка списка водителей (`DriverSearchItem.vue`). */
const fullNameOf = (parts: (string | null)[]): string => {
  const present = parts.filter((part): part is string => Boolean(part));

  return present.length > 0 ? present.join(' ') : 'имя не заведено';
};

/** Кто держит чат — для отказа `linked_to_other`. */
export const readOtherDriver = async (
  personId: string,
  client?: Prisma.TransactionClient,
): Promise<OtherDriver> => {
  const name = await findDriverListName(personId, client);

  return {
    personId,
    fullName: fullNameOf([name.lastName, name.firstName, name.middleName]),
    callsign: name.callsigns.length > 0 ? name.callsigns.join(', ') : null,
  };
};

/**
 * Все проверки привязки по порядку отказов issue: демо, участие, попытка, сотрудник, чужой чат,
 * свой же чат. С `lock` человек берётся `FOR UPDATE` — так зовёт привязка внутри транзакции.
 */
export const resolveRelinkCandidate = async (
  personId: string,
  telegramUserId: bigint,
  client?: Prisma.TransactionClient,
  lock = false,
): Promise<RelinkCandidate> => {
  const person = await findPersonTelegramState(personId, client, lock);

  if (!person) {
    throw new UnknownDriverError(personId);
  }

  if (person.isDemo) {
    throw new DriverDemoError(personId);
  }

  if (!person.isMember) {
    throw new DriverNotMemberError(personId);
  }

  const attempt = await findRelinkAttempt(personId, telegramUserId, client);

  if (!attempt) {
    throw new RelinkAttemptMissingError(personId, telegramUserId);
  }

  // Водителем и сотрудником одновременно быть нельзя: вторая сторона того же правила стоит
  // при принятии приглашения (docs/decisions.md → «Учётка сотрудника и роли»).
  if (await findEmployeeByTelegramUserId(attempt.telegramUserId, client)) {
    throw new TelegramOfEmployeeError(attempt.telegramUserId);
  }

  const chatLink = await findActiveLinkByChat(attempt.telegramChatId, client);

  if (chatLink && chatLink.personId !== personId) {
    throw new TelegramLinkedToOtherError(await readOtherDriver(chatLink.personId, client));
  }

  if (chatLink) {
    throw new TelegramAlreadyActiveError(personId);
  }

  return { attempt, currentLink: await findActiveLinkByPerson(personId, client) };
};

/** `GET /api/drivers/:personId/telegram-candidate` — ничего не пишет. */
export const readTelegramCandidate = async (
  personId: string,
  telegramUserId: bigint,
): Promise<DriverTelegramCandidateResponse> => {
  const { attempt, currentLink } = await resolveRelinkCandidate(personId, telegramUserId);

  return {
    telegramUserId: attempt.telegramUserId.toString(),
    phone: attempt.phoneE164 ?? attempt.phoneRaw,
    sharedAt: attempt.createdAt.toISOString(),
    currentTelegramChatId: currentLink?.telegramChatId.toString() ?? null,
  };
};
