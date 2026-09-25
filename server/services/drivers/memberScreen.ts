import { plainText, type TextKey } from '#server/bot/texts';
import type { Language, PointReason } from '#server/generated/prisma/enums';
import type { OwnOperationRow } from '#server/repositories/points';
import { isGiftIdempotencyKey } from '#server/services/points/idempotencyKey';
import {
  formatCalendarDate,
  formatClockTime,
  formatDayKey,
  previousDayKey,
} from '#server/utils/parkTime';
import type { MemberOperation, MemberScreenTexts } from '#shared/types/miniapp';

/**
 * Во что превращается строка журнала на экране водителя.
 *
 * Решений здесь нет ни одного — есть только перевод записи журнала на человеческий язык.
 * Живёт отдельным модулем, как и тексты экрана регистрации, потому что у него два
 * вызывающих: сервис экрана участника и сервис истории.
 */

/**
 * Текст причины на каждое значение `point_reason`.
 *
 * Одной таблицей, а не цепочкой `if`: полнота таблицы — единственная настоящая защита.
 * Новое значение перечисления обязано сломать сборку здесь и заставить написать текст,
 * тогда как запасное «операция» молча показало бы водителю слово, не значащее ничего.
 *
 * `recon` и `merge` сведены в один текст намеренно: объяснять водителю сверку журнала
 * и склейку двойников незачем, а два разных слова про одно и то же он прочтёт как две
 * разные непонятные вещи (issue #101).
 *
 * У ручной правки текстов два — по знаку суммы: «начислено» и «списано» сотрудником
 * это два разных события, и одно слово на оба означало бы, что водитель не понимает,
 * прибавили ему или забрали.
 */
const REASON_KEYS: Readonly<
  Record<PointReason, TextKey | Readonly<{ credit: TextKey; debit: TextKey }>>
> = {
  trip: 'reason_trip',
  welcome: 'reason_welcome',
  opening: 'reason_opening',
  order_spend: 'reason_order_spend',
  order_refund: 'reason_order_refund',
  manual: { credit: 'reason_manual_credit', debit: 'reason_manual_debit' },
  raffle: 'reason_raffle',
  expire: 'reason_expire',
  recon: 'reason_correction',
  merge: 'reason_correction',
  campaign: 'reason_campaign',
};

const reasonText = (reason: PointReason, delta: bigint, language: Language): string => {
  const keys = REASON_KEYS[reason];

  if (typeof keys === 'string') {
    return plainText(keys, language);
  }

  return plainText(delta < 0n ? keys.debit : keys.credit, language);
};

/**
 * Текст причины строки. Подарок от Xalq Taxi — причина `campaign`, как у акции, а узнаётся
 * по ключу перевода (issue #219): водитель знает его как подарок, а не как акцию.
 */
const operationReasonText = (row: OwnOperationRow, language: Language): string =>
  row.reason === 'campaign' && isGiftIdempotencyKey(row.idempotencyKey)
    ? plainText('reason_gift', language)
    : reasonText(row.reason, row.delta, language);

/**
 * Подпись дня над группой строк.
 *
 * Сегодняшний и вчерашний дни подписываются словами, остальные — датой. Слова не украшение:
 * водитель ищет в истории вчерашнюю поездку, а не поездку от одиннадцатого числа,
 * и переводить дату в «это было вчера» он не должен.
 */
const dayLabel = (
  day: string,
  today: string,
  yesterday: string,
  language: Language,
  moment: Date,
): string => {
  if (day === today) {
    return plainText('day_today', language);
  }

  if (day === yesterday) {
    return plainText('day_yesterday', language);
  }

  return formatCalendarDate(moment);
};

/**
 * Строка истории для экрана.
 *
 * «Сейчас» приходит параметром, а не берётся здесь: за время сборки одной страницы
 * полночь не наступает, но две строки одной страницы, посчитанные по разным моментам,
 * подписали бы один и тот же день по-разному.
 */
export const describeOperation = (
  row: OwnOperationRow,
  language: Language,
  now: Date,
): MemberOperation => {
  const day = formatDayKey(row.occurredAt);

  return {
    id: row.entryId,
    day,
    dayLabel: dayLabel(day, formatDayKey(now), previousDayKey(now), language, row.occurredAt),
    time: formatClockTime(row.occurredAt),
    // Списание и возврат несут номер заказа: отменённый заказ в истории — две строки,
    // и читаются они парой только по номеру. Журнал при этом не переписывается.
    reason:
      row.orderNumber === null
        ? operationReasonText(row, language)
        : plainText('history_order_reason', language, {
            reason: operationReasonText(row, language),
            number: String(row.orderNumber),
          }),
    delta: Number(row.delta),
  };
};

/** Тексты экрана участника на его языке. */
export const memberScreenTexts = (language: Language): MemberScreenTexts => ({
  profile: plainText('profile_title', language),
  balanceTitle: plainText('balance_title', language),
  exchange: plainText('button_exchange_points', language),
  back: plainText('button_back', language),
  retry: plainText('button_retry', language),
  historyTitle: plainText('history_title', language),
  historyAll: plainText('history_all', language),
  historyEmpty: plainText('history_empty', language),
  historyFailed: plainText('history_failed', language),
  ordersTitle: plainText('orders_title', language),
  ordersAll: plainText('orders_all', language),
  ordersEmpty: plainText('orders_empty', language),
  ordersFailed: plainText('orders_failed', language),
  ordersGroupPending: plainText('orders_group_pending', language),
  ordersGroupPast: plainText('orders_group_past', language),
  groupEmpty: plainText('group_empty', language),
  rewardsTitle: plainText('rewards_title', language),
  rewardsAll: plainText('rewards_all', language),
  rewardsEmpty: plainText('rewards_empty', language),
  rewardsFailed: plainText('rewards_failed', language),
  rewardCodeInside: plainText('reward_code_inside', language),
  officeLabel: plainText('office_label', language),
  officeMap: plainText('office_map', language),
  points: plainText('unit_points', language),
  pieces: plainText('unit_pieces', language),
  orderAmountSpent: plainText('order_amount_spent', language),
  orderAmountReturned: plainText('order_amount_returned', language),
  orderActionCode: plainText('order_action_code', language),
  orderActionView: plainText('order_action_view', language),
  orderCodeTitle: plainText('order_code_title', language),
  orderOfficeTitle: plainText('order_office_title', language),
  orderLinesTitle: plainText('order_lines_title', language),
  orderLineEach: plainText('order_line_each', language),
  // «Сумма» — тот же ключ, что итог корзины: смысл один, второй ключ разошёлся бы с первым.
  orderTotal: plainText('cart_total', language),
  cancelOrder: plainText('button_cancel_order', language),
  cancelQuestion: plainText('cancel_order_question', language),
  cancelHint: plainText('cancel_order_hint', language),
  yes: plainText('button_yes', language),
  no: plainText('button_no', language),
});
