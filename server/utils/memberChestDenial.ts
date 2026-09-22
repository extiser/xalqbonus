// `createError` берётся из `h3` явно — см. `denial.ts`: у обёртки Nuxt номер ответа
// необязателен, а отказ без номера не отказ.
import { createError, type H3Error } from 'h3';

import { plainText, type TextKey } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import {
  CampaignChestNotEarnedError,
  CampaignChestPrizeUnavailableError,
  MemberCampaignUnavailableError,
} from '#server/services/campaigns/errors';
import type { MemberChestDenialCode, MemberChestDenialPayload } from '#shared/types/miniapp';

/**
 * Отказ открытия сундука водителю, приведённый к ответу HTTP: код — экрану, текст — человеку
 * на его языке (issue #181). Устроен как `memberOrderDenial.ts`.
 *
 * `404` — акции водителю не видно, `409` — запрос верный, но сундук не открыть: он не заработан
 * или выпавший приз не выдать. Почему именно не заработан, водителю не говорится — экран
 * и так показывает состояние сундука, а причина уходит в лог.
 */

const DENIALS: Readonly<Record<MemberChestDenialCode, { status: 404 | 409; key: TextKey }>> = {
  campaign_unavailable: { status: 404, key: 'campaign_chest_denied_campaign' },
  chest_not_earned: { status: 409, key: 'campaign_chest_denied_not_earned' },
  prize_unavailable: { status: 409, key: 'campaign_chest_denied_prize' },
};

const STATUS_MESSAGE: Readonly<Record<404 | 409, string>> = {
  404: 'Not Found',
  409: 'Conflict',
};

/** Код отказа по доменной ошибке. `null` — ошибка не про сундук, и отказом её не назвать. */
export const chestDenialCode = (error: unknown): MemberChestDenialCode | null => {
  if (error instanceof MemberCampaignUnavailableError) {
    return 'campaign_unavailable';
  }

  if (error instanceof CampaignChestNotEarnedError) {
    return 'chest_not_earned';
  }

  if (error instanceof CampaignChestPrizeUnavailableError) {
    return 'prize_unavailable';
  }

  return null;
};

export const denyMemberChest = (code: MemberChestDenialCode, language: Language): H3Error => {
  const { status, key } = DENIALS[code];

  return createError({
    statusCode: status,
    statusMessage: STATUS_MESSAGE[status],
    message: plainText(key, language),
    data: { code } satisfies MemberChestDenialPayload,
  });
};
