import { countMailingAudience } from '#server/repositories/mailings';
import { findSegment } from '#server/repositories/segments';
import { MailingSegmentUnknownError } from '#server/services/mailings/errors';
import { toSegmentBasis } from '#server/services/segments/fields';
import type { MailingAudienceResponse } from '#shared/types/mailing';

/**
 * Сколько человек получит рассылку, если запустить её сейчас: участники программы
 * с активной привязкой Telegram. У демо-рассылки — только демо-водители (issue #212).
 * С сегментом — те из них, кто в его составе (issue #321).
 *
 * Тем же отбором, которым запуск снимает снимок (server/repositories/mailings.ts): число
 * на экране и число строк снимка расходятся только на тех, кто вступил в программу, потерял
 * привязку или выпал из условий сегмента между подсчётом и нажатием.
 *
 * Архивный сегмент и сегмент другого мира считаются так же: число честно говорит, кого бы
 * он взял, а не пустит такой запуск — со своей причиной.
 */
export const readMailingAudience = async (
  isDemo: boolean,
  segmentId: string | null,
): Promise<MailingAudienceResponse> => {
  if (segmentId === null) {
    return countMailingAudience(isDemo, null);
  }

  const segment = await findSegment(segmentId);

  if (!segment) {
    throw new MailingSegmentUnknownError(segmentId);
  }

  return countMailingAudience(isDemo, toSegmentBasis(segment));
};
