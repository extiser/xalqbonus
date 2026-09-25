import { countedPlainText, plainText } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import type { PersonRewardRow } from '#server/repositories/rewards';
import { toMemberOffice } from '#server/services/offices/readMemberOffices';
import { formatCalendarDate, formatClockTime, formatDayMonthWord } from '#server/utils/parkTime';
import type { MemberReward, MemberRewardTexts } from '#shared/types/rewards';

/**
 * Во что превращается награда на экране водителя. Решений здесь нет — только перевод строки
 * на язык водителя, как `memberOrderScreen.ts` у заказа.
 */

/** Момент в зоне парка: «20.09.2026, 16:10». Цифрами — одинаково на обоих языках. */
const formatMoment = (moment: Date): string =>
  `${formatCalendarDate(moment)}, ${formatClockTime(moment)}`;

/**
 * Срок ждущей словом месяца: «5 октября». Пустого срока у ждущей не бывает — у баллов его нет,
 * но баллы и не ждут; пустая строка здесь лучше выдуманной даты.
 */
const deadline = (row: PersonRewardRow, language: Language): string =>
  row.expiresAt ? formatDayMonthWord(row.expiresAt, language) : '';

/** Откуда награда: источник и пояснение внутри него. */
const originText = (row: PersonRewardRow, language: Language): string => {
  const source =
    row.source === 'campaign'
      ? plainText('reward_origin_campaign', language, { title: row.campaignTitle ?? '' })
      : plainText('reward_origin_manual', language);

  return row.sourceNote ? `${source} · ${row.sourceNote}` : source;
};

/**
 * Слово состояния и уточнение после точки. Полной разборкой статуса: новый статус обязан
 * сломать сборку здесь, а не показать водителю пустое место.
 */
const stateParts = (row: PersonRewardRow, language: Language): { word: string; hint: string } => {
  switch (row.status) {
    case 'credited':
      return { word: plainText('reward_state_credited', language), hint: formatCalendarDate(row.createdAt) };
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
    // Код выданной и сгоревшей освобождён и может принадлежать чужой награде.
    code: awaiting ? row.code : null,
    office: row.office === null ? null : toMemberOffice(row.office),
    photoPath: product ? row.photoPath : null,
    photoUpdatedAt: product ? (row.photoUpdatedAt?.toISOString() ?? null) : null,
    pricePoints: product ? row.pricePoints : null,
  };
};

/** Тексты раздела и экрана награды на языке участника. */
export const memberRewardTexts = (language: Language): MemberRewardTexts => ({
  awaitingGroup: plainText('rewards_group_awaiting', language),
  pastGroup: plainText('rewards_group_past', language),
  screenTitle: plainText('reward_screen_title', language),
  codeTitle: plainText('reward_code_title', language),
});
