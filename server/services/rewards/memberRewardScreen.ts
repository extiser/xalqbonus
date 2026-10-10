import { countedPlainText, plainText } from '#server/bot/texts';
import { giftCoverUrl } from '#server/adapters/uploads/giftCovers';
import type { Language } from '#server/generated/prisma/enums';
import type { MemberGiftRow } from '#server/repositories/gifts';
import type { PersonRewardRow, SheetRewardRow } from '#server/repositories/rewards';
import { toMemberOffice } from '#server/services/offices/readMemberOffices';
import { calendarDayMoment, formatCalendarDate, formatClockTime, formatDayMonthWord } from '#server/utils/parkTime';
import { rewardDeadlineDay } from '#shared/reward';
import type { MemberGift, MemberReward, MemberRewardTexts, MemberSheetReward } from '#shared/types/rewards';

/**
 * Во что превращается награда на экране водителя. Решений здесь нет — только перевод строки
 * на язык водителя, как `memberOrderScreen.ts` у заказа.
 */

/** Момент в зоне парка: «20.09.2026, 16:10». Цифрами — одинаково на обоих языках. */
const formatMoment = (moment: Date): string =>
  `${formatCalendarDate(moment)}, ${formatClockTime(moment)}`;

/**
 * Срок ждущей словом месяца: «5 октября». Пустого срока у ждущей не бывает — у баллов его нет,
 * но баллы и не ждут; пустая строка здесь лучше выдуманной даты. День — по правилу
 * `rewardDeadlineDay`, общему со служебными экранами.
 */
const deadline = (row: Pick<PersonRewardRow, 'expiresAt' | 'source'>, language: Language): string => {
  if (!row.expiresAt) {
    return '';
  }

  return formatDayMonthWord(calendarDayMoment(rewardDeadlineDay(row.expiresAt, row.source)), language);
};

/**
 * Откуда награда: источник и пояснение внутри него. Полной разборкой источника — новый
 * источник обязан сломать сборку здесь. У подарка пояснение — повод раздачи:
 * «Xalq Taxi · ко Дню учителя».
 */
const sourceText = (row: PersonRewardRow, language: Language): string => {
  switch (row.source) {
    case 'campaign':
      return plainText('reward_origin_campaign', language, { title: row.campaignTitle ?? '' });
    case 'manual':
      return plainText('reward_origin_manual', language);
    case 'gift':
      return plainText('reward_origin_gift', language);
  }
};

/**
 * Пояснение внутри источника на языке водителя: русское лежит в награде. У подарка узбекское —
 * повод раздачи, у ручной — своё «Почему» (issue #266); у выданных до него узбекского нет,
 * и водитель видит русское, как прежде.
 */
const noteText = (row: PersonRewardRow, language: Language): string | null => {
  if (language !== 'uz') {
    return row.sourceNote;
  }

  switch (row.source) {
    case 'gift':
      return row.giftReasonUz ?? row.sourceNote;
    case 'manual':
      return row.sourceNoteUz ?? row.sourceNote;
    case 'campaign':
      return row.sourceNote;
  }
};

const originText = (row: PersonRewardRow, language: Language): string => {
  const source = sourceText(row, language);
  const note = noteText(row, language);

  return note ? `${source} · ${note}` : source;
};

/**
 * Слово состояния и уточнение после точки. Полной разборкой статуса: новый статус обязан
 * сломать сборку здесь, а не показать водителю пустое место.
 */
const stateParts = (row: PersonRewardRow, language: Language): { word: string; hint: string } => {
  switch (row.status) {
    case 'credited':
      // Подарок лёг на баланс в момент зачисления, а не вручения.
      return {
        word: plainText('reward_state_credited', language),
        hint: formatCalendarDate(row.claimedAt ?? row.createdAt),
      };
    case 'awaiting':
      return {
        word: plainText('reward_word_awaiting', language),
        hint: plainText('reward_until', language, { date: deadline(row, language) }),
      };
    case 'issued':
      return {
        word: plainText('reward_word_issued', language),
        hint: row.issuedAt ? formatMoment(row.issuedAt) : '',
      };
    case 'expired':
      return {
        word: plainText('reward_word_expired', language),
        hint: row.expiredAt ? formatCalendarDate(row.expiredAt) : '',
      };
    // Отменённая выглядит как сгоревшая (issue #270): слово своё, уточнение — дата отмены,
    // а строки-причины у неё нет.
    case 'cancelled':
      return {
        word: plainText('reward_state_cancelled', language),
        hint: row.cancelledAt ? formatCalendarDate(row.cancelledAt) : '',
      };
  }
};

export const describeMemberReward = (row: PersonRewardRow, language: Language): MemberReward => {
  const state = stateParts(row, language);
  const awaiting = row.status === 'awaiting';
  const expired = row.status === 'expired';
  const product = row.kind === 'product';

  return {
    rewardId: row.id,
    kind: row.kind,
    status: row.status,
    // Баллы называются числом на языке водителя; у товара и произвольной — сохранённое название.
    title:
      row.kind === 'points' && row.points !== null
        ? countedPlainText('reward_points', language, row.points)
        : row.title,
    originText: originText(row, language),
    stateWord: state.word,
    stateHint: state.hint,
    claimHint: awaiting ? plainText('reward_claim_until', language, { date: deadline(row, language) }) : null,
    // Строка главной собирается здесь целиком: у ждущей на узбекском срок стоит перед словом.
    stateText: awaiting
      ? plainText('reward_state_awaiting', language, { date: deadline(row, language) })
      : `${state.word} · ${state.hint}`,
    reasonText: expired ? plainText('reward_expired_reason', language) : null,
    reasonTextFull: expired ? plainText('reward_expired_reason_full', language) : null,
    // Код выданной, сгоревшей и отменённой освобождён и может принадлежать чужой награде.
    code: awaiting ? row.code : null,
    office: row.office === null ? null : toMemberOffice(row.office),
    photoPath: product ? row.photoPath : null,
    photoUpdatedAt: product ? (row.photoUpdatedAt?.toISOString() ?? null) : null,
    pricePoints: product ? row.pricePoints : null,
  };
};

/**
 * Ждущий подарок на языке водителя. Срок — день раздачи словом месяца: баллы придут сами
 * в конце этого календарного дня. Обложка — тоже на его языке (issue #236).
 */
export const describeMemberGift = (row: MemberGiftRow, language: Language): MemberGift => ({
  rewardId: row.id,
  title: countedPlainText('gift_title', language, row.points),
  reasonText: plainText('gift_reason', language, {
    reason: language === 'uz' ? row.reasonUz : row.reasonRu,
  }),
  deadlineText: plainText('gift_deadline', language, {
    date: formatDayMonthWord(calendarDayMoment(row.untilDate.toISOString().slice(0, 10)), language),
  }),
  coverUrl: giftCoverUrl(language === 'uz' ? row.coverUzPath : row.coverRuPath),
});

/**
 * Ручная награда в шторке подарков на языке водителя (issue #266): «Почему» после «Xalq Taxi»,
 * как повод подарка, офис и день «Забрать до», обложка на его языке.
 */
export const describeSheetReward = (row: SheetRewardRow, language: Language): MemberSheetReward => ({
  rewardId: row.id,
  title: row.title,
  reasonText: plainText('gift_reason', language, {
    reason: (language === 'uz' ? row.sourceNoteUz : null) ?? row.sourceNote ?? '',
  }),
  deadlineText: plainText('reward_sheet_deadline', language, {
    office: row.officeName,
    date: deadline({ expiresAt: row.expiresAt, source: 'manual' }, language),
  }),
  coverUrl: giftCoverUrl(language === 'uz' ? row.coverUzPath : row.coverRuPath),
});

/** Тексты раздела и экрана награды на языке участника. */
export const memberRewardTexts = (language: Language): MemberRewardTexts => ({
  awaitingGroup: plainText('rewards_group_awaiting', language),
  pastGroup: plainText('rewards_group_past', language),
  screenTitle: plainText('reward_screen_title', language),
  codeTitle: plainText('reward_code_title', language),
  giftsTitleOne: plainText('gifts_title_one', language),
  giftsTitleMany: plainText('gifts_title_many', language),
  giftsSubtitle: plainText('gifts_subtitle', language),
  giftTake: plainText('gift_take', language),
  giftsTakeAll: plainText('gifts_take_all', language),
  giftsClose: plainText('button_close', language),
  giftTapHint: plainText('gift_tap_hint', language),
  giftTakeFailed: plainText('gift_take_failed', language),
  rewardOpen: plainText('reward_open', language),
  rewardSheetSubtitle: plainText('reward_sheet_subtitle', language),
});
