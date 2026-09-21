import { countedPlainText, plainText } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import type { PersonRewardRow } from '#server/repositories/rewards';
import { formatCalendarDate, formatClockTime } from '#server/utils/parkTime';
import type { MemberReward, MemberRewardTexts } from '#shared/types/rewards';

/**
 * Во что превращается награда на экране водителя. Решений здесь нет — только перевод строки
 * на язык водителя, как `memberOrderScreen.ts` у заказа.
 */

/** Момент в зоне парка: «15.09.2026 14:32». Цифрами — одинаково на обоих языках. */
const formatMoment = (moment: Date): string =>
  `${formatCalendarDate(moment)} ${formatClockTime(moment)}`;

/** Откуда награда: источник и пояснение внутри него. */
const originText = (row: PersonRewardRow, language: Language): string => {
  const source =
    row.source === 'campaign'
      ? plainText('reward_origin_campaign', language, { title: row.campaignTitle ?? '' })
      : plainText('reward_origin_manual', language);

  return row.sourceNote ? `${source} · ${row.sourceNote}` : source;
};

/**
 * Состояние словами. Полной разборкой статуса: новый статус обязан сломать сборку здесь,
 * а не показать водителю пустое место.
 */
const stateText = (row: PersonRewardRow, language: Language): string => {
  switch (row.status) {
    case 'credited':
      return plainText('reward_state_credited', language);
    case 'awaiting':
      return plainText('reward_state_awaiting', language, {
        date: row.expiresAt ? formatCalendarDate(row.expiresAt) : '',
      });
    case 'issued':
      return plainText('reward_state_issued', language, {
        moment: row.issuedAt ? formatMoment(row.issuedAt) : '',
      });
    case 'expired':
      return plainText('reward_state_expired', language, {
        date: row.expiredAt ? formatCalendarDate(row.expiredAt) : '',
      });
  }
};

export const describeMemberReward = (row: PersonRewardRow, language: Language): MemberReward => ({
  rewardId: row.id,
  kind: row.kind,
  status: row.status,
  // Баллы называются числом на языке водителя; у товара и произвольной — сохранённое название.
  title:
    row.kind === 'points' && row.points !== null
      ? countedPlainText('reward_points', language, row.points)
      : row.title,
  originText: originText(row, language),
  stateText: stateText(row, language),
  // Код выданной и сгоревшей освобождён и может принадлежать чужой награде.
  code: row.status === 'awaiting' ? row.code : null,
  officeName: row.officeName,
  officeAddress: row.officeAddress,
});

/** Тексты раздела на языке участника. */
export const memberRewardTexts = (language: Language): MemberRewardTexts => ({
  myRewards: plainText('button_my_rewards', language),
  rewardsTitle: plainText('rewards_title', language),
  rewardsEmpty: plainText('rewards_empty', language),
  rewardsFailed: plainText('rewards_failed', language),
  codeTitle: plainText('reward_code_title', language),
});
