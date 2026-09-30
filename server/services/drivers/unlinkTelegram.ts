import { consola } from 'consola';
import { db } from '#server/db';
import { enqueueNotification } from '#server/queues/notifications';
import { findPersonTelegramState } from '#server/repositories/drivers';
import {
  closeTelegramLinkByOperator,
  findActiveLinkByPerson,
} from '#server/repositories/programMembership';
import {
  DriverDemoError,
  NoActiveTelegramLinkError,
  UnknownDriverError,
} from '#server/services/drivers/telegramLinkErrors';

/**
 * Отвязка Telegram из карточки водителя (issue #305): действующая привязка закрывается
 * без новой.
 *
 * Участие, счёт и баланс не трогаются: баланс принадлежит человеку, а не мессенджеру
 * (docs/drivers.md → «Три уровня личности»). Водитель вернётся, поделившись номером
 * с нового Telegram, — и привязку ему откроют из карточки.
 *
 * Сообщение в отвязанный чат ставится после фиксации (docs/drivers.md → «Уведомление
 * о перепривязке уходит после записи»).
 */

const log = consola.withTag('drivers:telegram');

export type UnlinkTelegramRequest = {
  actorEmployeeId: string;
  personId: string;
};

export const unlinkTelegram = async (request: UnlinkTelegramRequest): Promise<void> => {
  const { actorEmployeeId, personId } = request;

  const closedLink = await db.$transaction(async (transaction) => {
    const person = await findPersonTelegramState(personId, transaction, true);

    if (!person) {
      throw new UnknownDriverError(personId);
    }

    if (person.isDemo) {
      throw new DriverDemoError(personId);
    }

    const link = await findActiveLinkByPerson(personId, transaction);

    if (!link) {
      throw new NoActiveTelegramLinkError(personId);
    }

    await closeTelegramLinkByOperator(link.linkId, actorEmployeeId, transaction);

    return link;
  });

  log.info('telegram отвязан', {
    personId,
    actorEmployeeId,
    closedChatId: closedLink.telegramChatId.toString(),
  });

  try {
    await enqueueNotification({
      personId,
      linkId: closedLink.linkId,
      template: 'telegram_unlinked',
      params: {},
    });
  } catch (error) {
    // Отвязка уже сделана — отказ очереди не отказ операции. Причина остаётся в логе.
    log.error('уведомление об отвязке не поставлено в очередь', {
      personId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
