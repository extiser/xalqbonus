import {
  buildRewardMessage,
  buildRewardMessageFooter,
  missingValue,
  type RewardMessageValues,
} from '#server/bot/notifications';
import type { Language } from '#server/generated/prisma/enums';
import { findOffice } from '#server/repositories/offices';
import { findProduct } from '#server/repositories/products';
import { isCalendarDay } from '#shared/campaign';
import { REWARD_FIELD_LABELS } from '#shared/reward';
import type { GiftMessagePreviewResponse } from '#shared/types/rewards';

/**
 * Системный текст ручной награды по тому, что набрано в форме «Вручить» (issue #266) — как
 * у подарка (`previewGiftMessage.ts`): над полями своего текста — что уйдёт, если поле оставить
 * пустым, и строка, что встанет под своим.
 *
 * Собирается той же сборкой, что сообщение водителю (`buildRewardMessage`). Название товара
 * и офис читаются по выбранному, как их назовёт сообщение. Чего нет или что не читается —
 * подпись поля в фигурных скобках, «{Где получать}», а не отказ: предпросмотр ничего не решает
 * и ничего не пишет.
 */

export type RewardMessagePreviewInput = {
  kind: string;
  productId: string | null;
  title: string;
  officeId: string | null;
  untilDate: string;
  noteRu: string;
  noteUz: string;
};

const readText = (value: string): string | null => {
  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
};

/** Что выдаётся: у товара — его название, у произвольной — набранное. Нет — подпись поля. */
const readTitle = async (input: RewardMessagePreviewInput): Promise<string> => {
  if (input.kind === 'product') {
    const product = input.productId === null ? null : await findProduct(input.productId);

    return product?.name ?? missingValue(REWARD_FIELD_LABELS.product);
  }

  return readText(input.title) ?? missingValue(REWARD_FIELD_LABELS.title);
};

export const previewRewardMessage = async (input: RewardMessagePreviewInput): Promise<GiftMessagePreviewResponse> => {
  const office = input.officeId === null ? null : await findOffice(input.officeId);
  const title = await readTitle(input);
  const untilDate = isCalendarDay(input.untilDate.trim()) ? input.untilDate.trim() : null;

  const values = (language: Language): RewardMessageValues => ({
    title,
    reason: readText(language === 'uz' ? input.noteUz : input.noteRu),
    officeName: office?.name ?? null,
    untilDate,
  });

  return {
    systemRu: buildRewardMessage(values('ru'), null, 'ru').text,
    systemUz: buildRewardMessage(values('uz'), null, 'uz').text,
    footerRu: buildRewardMessageFooter(values('ru'), 'ru'),
    footerUz: buildRewardMessageFooter(values('uz'), 'uz'),
  };
};
