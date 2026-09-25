import { buildGiftMessage, buildGiftMessageFooter, type GiftMessageValues } from '#server/bot/notifications';
import type { Language } from '#server/generated/prisma/enums';
import { isCalendarDay } from '#shared/campaign';
import type { GiftMessagePreviewResponse } from '#shared/types/rewards';

/**
 * Системный текст подарка по тому, что набрано в форме «Вручить» (issue #236): над полями
 * своего текста — что уйдёт, если поле оставить пустым, и строка, что встанет под своим.
 *
 * Собирается той же сборкой, что сообщение водителю (`buildGiftMessage`): в форме видно ровно
 * то, что уйдёт. Форма недонабрана почти всегда — на месте того, чего нет или что не читается,
 * встаёт подпись поля в фигурных скобках, «{Сумма баллов}», а не отказ: предпросмотр ничего
 * не решает и ничего не пишет.
 */

export type GiftMessagePreviewInput = {
  points: number | null;
  reasonRu: string;
  reasonUz: string;
  untilDate: string;
};

const readPoints = (points: number | null): number | null =>
  points !== null && Number.isSafeInteger(points) && points > 0 ? points : null;

const readText = (value: string): string | null => {
  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
};

export const previewGiftMessage = (input: GiftMessagePreviewInput): GiftMessagePreviewResponse => {
  const points = readPoints(input.points);
  const untilDate = isCalendarDay(input.untilDate.trim()) ? input.untilDate.trim() : null;

  const values = (language: Language): GiftMessageValues => ({
    points,
    reason: readText(language === 'uz' ? input.reasonUz : input.reasonRu),
    untilDate,
  });

  return {
    systemRu: buildGiftMessage(values('ru'), null, 'ru').text,
    systemUz: buildGiftMessage(values('uz'), null, 'uz').text,
    footerRu: buildGiftMessageFooter(values('ru'), 'ru'),
    footerUz: buildGiftMessageFooter(values('uz'), 'uz'),
  };
};
