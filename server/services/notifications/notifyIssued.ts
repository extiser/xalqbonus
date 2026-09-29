import { consola } from 'consola';
import { enqueueNotification } from '#server/queues/notifications';
import { findDriverAccountByPerson } from '#server/repositories/points';
import { findNotificationRecipient } from '#server/repositories/programMembership';

/**
 * Уведомление водителю «выдано в офисе» (issue #295) — одно на все выдачи: заказ по коду,
 * заказ за баллы, оформленный сотрудником у стойки, и награда по коду.
 *
 * Зовётся **после** фиксации транзакции выдачи, а не внутри неё: откат не должен оставить
 * отправленное сообщение. Розничный заказ её не зовёт — водителю он не показывается вовсе
 * (docs/decisions.md → «Заказ оформляет сотрудник у стойки: за баллы или за розницу»).
 *
 * Отказ наверх не поднимается: выдача уже сделана, и уронить ответ сотруднику из-за очереди
 * значило бы вернуть ему «ошибку» на выданный заказ. Причина остаётся в логе.
 */

const log = consola.withTag('notifications:issued');

export type IssuedInOffice =
  | {
      kind: 'order';
      personId: string;
      officeName: string;
      lines: { name: string; quantity: number }[];
      /** Сколько баллов заказ стоил. Остаток после читается здесь, уже после фиксации. */
      pointsSpent: number;
    }
  | {
      kind: 'reward';
      personId: string;
      officeName: string;
      title: string;
    };

export const notifyIssued = async (issued: IssuedInOffice): Promise<void> => {
  try {
    // Без активной привязки писать некуда, и задание не ставится. Отправка проверит привязку
    // ещё раз: пока оно лежит в очереди, она может пропасть.
    if ((await findNotificationRecipient(issued.personId)) === null) {
      log.info('уведомление о выдаче не поставлено: активной привязки нет', {
        personId: issued.personId,
        kind: issued.kind,
      });

      return;
    }

    if (issued.kind === 'reward') {
      await enqueueNotification({
        personId: issued.personId,
        template: 'issued_in_office',
        params: {
          officeName: issued.officeName,
          items: [{ name: issued.title, quantity: 1 }],
          points: null,
        },
      });

      return;
    }

    const account = await findDriverAccountByPerson(issued.personId);

    await enqueueNotification({
      personId: issued.personId,
      template: 'issued_in_office',
      params: {
        officeName: issued.officeName,
        items: issued.lines.map((line) => ({ name: line.name, quantity: line.quantity })),
        points: { spent: issued.pointsSpent, balance: Number(account?.balance ?? 0n) },
      },
    });
  } catch (error) {
    log.error('уведомление о выдаче не поставлено в очередь', {
      personId: issued.personId,
      kind: issued.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
