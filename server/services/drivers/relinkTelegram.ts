import { consola } from 'consola';
import { db } from '#server/db';
import { enqueueNotification } from '#server/queues/notifications';
import { findDriverAccountByPerson } from '#server/repositories/points';
import {
  closeTelegramLinkByOperator,
  findActiveLinkByChat,
  insertOperatorTelegramLink,
} from '#server/repositories/programMembership';
import { findRelinkAttempt } from '#server/repositories/telegramLinkAttempts';
import {
  readOtherDriver,
  resolveRelinkCandidate,
} from '#server/services/drivers/readTelegramCandidate';
import {
  PersonLinkChangedError,
  TelegramAlreadyActiveError,
  TelegramLinkedToOtherError,
} from '#server/services/drivers/telegramLinkErrors';
import { describeDatabaseFailure, UNIQUE_VIOLATION } from '#server/utils/postgresErrors';

/**
 * Привязка Telegram из карточки водителя (issue #305): сотрудник в офисе вбивает ID с экрана
 * отказа, действующая привязка закрывается, новая открывается.
 *
 * Операция, а не побочный эффект (docs/drivers.md → «Перепривязка — операция, а не побочный
 * эффект»): выполняет сотрудник, строка закрывается с его именем, новая открывается с ним же
 * в `operator_employee_id`, на прежний чат уходит сообщение. История не трогается — прежняя
 * строка закрывается, новая ложится рядом.
 *
 * Уведомления ставятся после фиксации: сначала привязка закрыта, потом сообщение
 * (docs/drivers.md → «Уведомление о перепривязке уходит после записи»).
 */

const log = consola.withTag('drivers:telegram');

export type RelinkTelegramRequest = {
  actorEmployeeId: string;
  personId: string;
  /** ID с экрана отказа водителя. Выбирает попытку, а не становится привязкой сам. */
  telegramUserId: bigint;
};

/**
 * Отказ базы в отказ привязки — как `outcomeForConstraint` в `registerDriverByContact.ts`.
 *
 * Проверки выше стоят под блокировкой человека, но автопривязка из бота человека не блокирует:
 * между чтением и вставкой она успевает занять чат или открыть человеку привязку. Отбитая
 * база — отказ сотруднику, а не пятисотка.
 *
 * Индекс на человека — это водителю привязали другой Telegram, не этот: отказ говорит обновить
 * карточку. Индекс на чат — чат занят, и отказ называет того, чья привязка на нём. Любое другое
 * ограничение отказом не является и уходит наверх как есть.
 *
 * Индекс на человека — защита на будущее, а не ожидаемый исход: вставка привязки проверяет
 * внешний ключ и берёт на строку `persons` блокировку `FOR KEY SHARE`, несовместимую с нашей
 * `FOR UPDATE`. Автопривязка того же водителя поэтому ждёт нас или мы ждём её — и тогда видим
 * её привязку действующей и закрываем штатно. Проверено на локальной базе 30-09-2026.
 */
const failureForConstraint = async (
  error: unknown,
  request: RelinkTelegramRequest,
): Promise<Error | null> => {
  const failure = describeDatabaseFailure(error);

  if (!failure || failure.code !== UNIQUE_VIOLATION) {
    return null;
  }

  log.warn('привязку из карточки отбило ограничение базы', {
    personId: request.personId,
    constraint: failure.constraintName,
  });

  if (failure.constraintName === 'telegram_links_active_person_key') {
    return new PersonLinkChangedError(request.personId);
  }

  if (failure.constraintName !== 'telegram_links_active_chat_key') {
    return null;
  }

  // Чат заняли: кто именно — читается уже после отката, по той же попытке.
  const attempt = await findRelinkAttempt(request.personId, request.telegramUserId);
  const holder = attempt ? await findActiveLinkByChat(attempt.telegramChatId) : null;

  return holder && holder.personId !== request.personId
    ? new TelegramLinkedToOtherError(await readOtherDriver(holder.personId))
    : new TelegramAlreadyActiveError(request.personId);
};

/** Одна транзакция: проверки под блокировкой человека, закрытие прежней строки, новая строка. */
const writeRelink = (request: RelinkTelegramRequest) =>
  db.$transaction(async (transaction) => {
    const { actorEmployeeId, personId } = request;
    const { attempt, currentLink } = await resolveRelinkCandidate(
      personId,
      request.telegramUserId,
      transaction,
      true,
    );

    if (currentLink) {
      await closeTelegramLinkByOperator(currentLink.linkId, actorEmployeeId, transaction);
    }

    await insertOperatorTelegramLink(
      {
        personId,
        telegramChatId: attempt.telegramChatId,
        telegramUserId: attempt.telegramUserId,
        operatorEmployeeId: actorEmployeeId,
      },
      transaction,
    );

    // Счёт у участника есть; у перенесённых с нулём его может не быть — тогда ноль, как
    // показывает его бот (`readLinkedDriver`): чтение счёта не заводит.
    const account = await findDriverAccountByPerson(personId, transaction);

    return {
      closedLink: currentLink,
      newChatId: attempt.telegramChatId,
      points: Number(account?.balance ?? 0n),
    };
  });

export const relinkTelegram = async (request: RelinkTelegramRequest): Promise<void> => {
  const { actorEmployeeId, personId } = request;

  let result: Awaited<ReturnType<typeof writeRelink>>;

  try {
    result = await writeRelink(request);
  } catch (error) {
    throw (await failureForConstraint(error, request)) ?? error;
  }

  log.info('telegram перепривязан', {
    personId,
    actorEmployeeId,
    closedChatId: result.closedLink?.telegramChatId.toString() ?? null,
    newChatId: result.newChatId.toString(),
  });

  try {
    if (result.closedLink) {
      await enqueueNotification({
        personId,
        linkId: result.closedLink.linkId,
        template: 'telegram_moved',
        params: {},
      });
    }

    await enqueueNotification({ personId, template: 'telegram_linked', params: { points: result.points } });
  } catch (error) {
    // Привязка уже сделана: уронить ответ сотруднику из-за очереди значило бы вернуть ему
    // «ошибку» на выполненную операцию. Причина остаётся в логе.
    log.error('уведомления о перепривязке не поставлены в очередь', {
      personId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
