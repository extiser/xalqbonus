import { consola } from 'consola';
import { db } from '#server/db';
import { enqueueNotifications } from '#server/queues/notifications';
import { insertGiftGrant, insertGiftRewards } from '#server/repositories/gifts';
import { listProgramMemberIds } from '#server/repositories/programMembership';
import { findSegment, listSegmentPersonIds } from '#server/repositories/segments';
import { GiftRecipientError, InvalidGiftGrantError } from '#server/services/gifts/errors';
import { toSegmentConditions } from '#server/services/segments/fields';
import { parkDayKey, shiftDayKey } from '#server/utils/parkTime';
import { isCalendarDay } from '#shared/campaign';

/**
 * Раздача подарка от Xalq Taxi (issue #219): баллы одному водителю или сегменту, каждому —
 * награда `claimable`, которую он забирает в приложении или получает сам в назначенный день.
 *
 * **Журнал здесь не пишется.** Баллы ложатся на баланс в момент зачисления (`creditGift`),
 * а до него подарок только обещан: забрать его — повод зайти в приложение.
 *
 * Получают только участники программы — есть строка `person_settings`: вне программы баллы
 * не копятся. Из сегмента не-участники пропускаются и считаются в `skipped`; одному водителю
 * вне программы — отказ.
 *
 * Состав сегмента снимается на момент раздачи тем же построителем, что у запуска акции,
 * и дальше не пересчитывается. Раздача и все её награды — одна транзакция: половина раздачи
 * означала бы водителей, которым не досталось, без следа причины. Сообщения водителям
 * ставятся после фиксации — сообщение о подарке, который откатился, хуже, чем никакого.
 */

const log = consola.withTag('gifts:grant');

export type GiftRecipient =
  | { kind: 'person'; personId: string }
  | { kind: 'segment'; segmentId: string };

export type GrantGiftInput = {
  recipient: GiftRecipient;
  /** Как пришло: проверяется здесь. */
  points: number | null;
  reason: string;
  /** «Забрать до», `YYYY-MM-DD`. */
  untilDate: string;
  employeeId: string;
};

export type GrantGiftResult = {
  giftGrantId: string;
  recipients: number;
  skipped: number;
};

/** Столбец `points` — `int`: сумма больше него не запишется. */
const MAX_POINTS = 2_147_483_647;

type ValidGift = { points: number; reason: string; untilDate: string };

const validate = (input: GrantGiftInput, now: Date): ValidGift => {
  const { points } = input;

  if (points === null || !Number.isInteger(points) || points <= 0 || points > MAX_POINTS) {
    throw new InvalidGiftGrantError('points_invalid');
  }

  const reason = input.reason.trim();

  if (reason === '') {
    throw new InvalidGiftGrantError('reason_missing');
  }

  const untilDate = input.untilDate.trim();

  if (!isCalendarDay(untilDate)) {
    throw new InvalidGiftGrantError('until_date_invalid');
  }

  // Строки `YYYY-MM-DD` сравниваются как даты. Сегодняшний день парка не годится: подарок
  // зачислился бы этой же ночью, не успев подождать водителя.
  if (untilDate < shiftDayKey(parkDayKey(now), 1)) {
    throw new InvalidGiftGrantError('until_date_too_early');
  }

  return { points, reason, untilDate };
};

export const grantGift = async (input: GrantGiftInput): Promise<GrantGiftResult> => {
  const gift = validate(input, new Date());
  const { recipient } = input;

  const granted = await db.$transaction(async (transaction) => {
    let personIds: string[];
    let skipped = 0;

    if (recipient.kind === 'segment') {
      const segment = await findSegment(recipient.segmentId, transaction);

      if (!segment) {
        throw new GiftRecipientError('segment_unknown');
      }

      if (segment.archivedAt !== null) {
        throw new GiftRecipientError('segment_archived');
      }

      const audience = await listSegmentPersonIds(toSegmentConditions(segment), transaction);

      personIds = await listProgramMemberIds(audience, transaction);
      skipped = audience.length - personIds.length;

      if (personIds.length === 0) {
        throw new GiftRecipientError('segment_no_members');
      }
    } else {
      personIds = await listProgramMemberIds([recipient.personId], transaction);

      if (personIds.length === 0) {
        throw new GiftRecipientError('person_not_member');
      }
    }

    const giftGrantId = await insertGiftGrant(transaction, {
      ...gift,
      segmentId: recipient.kind === 'segment' ? recipient.segmentId : null,
      personId: recipient.kind === 'person' ? recipient.personId : null,
      recipients: personIds.length,
      skipped,
      grantedByEmployeeId: input.employeeId,
    });

    const inserted = await insertGiftRewards(transaction, {
      giftGrantId,
      personIds,
      points: gift.points,
      // Как у награды-баллов ручной выдачи: водителю сумму называет экран на его языке.
      title: `Баллы: ${gift.points}`,
      reason: gift.reason,
      untilDate: gift.untilDate,
      grantedByEmployeeId: input.employeeId,
    });

    if (inserted !== personIds.length) {
      throw new Error(`раздача ${giftGrantId}: подарков ${inserted} вместо ${personIds.length}`);
    }

    return { giftGrantId, personIds, skipped };
  });

  log.info('подарок роздан', {
    giftGrantId: granted.giftGrantId,
    recipient: recipient.kind,
    recipients: granted.personIds.length,
    skipped: granted.skipped,
    points: gift.points,
  });

  // Раздача уже зафиксирована: упавшая постановка сообщений её не отменяет — подарки ждут
  // в приложении и без сообщения, а причина остаётся в логе.
  try {
    await enqueueNotifications(
      granted.personIds.map((personId) => ({
        personId,
        template: 'gift_received',
        params: { points: gift.points, reason: gift.reason, untilDate: gift.untilDate },
      })),
    );
  } catch (error) {
    log.error('сообщения о подарке не поставились в очередь', {
      giftGrantId: granted.giftGrantId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    giftGrantId: granted.giftGrantId,
    recipients: granted.personIds.length,
    skipped: granted.skipped,
  };
};
