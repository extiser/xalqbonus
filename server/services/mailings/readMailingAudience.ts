import { countMailingAudience } from '#server/repositories/mailings';
import type { MailingAudienceResponse } from '#shared/types/mailing';

/**
 * Сколько человек получит рассылку с этим фильтром, если запустить её сейчас.
 *
 * Тем же отбором, которым запуск снимает снимок (server/repositories/mailings.ts): число
 * на экране и число строк снимка расходятся только на тех, кто вступил в программу или
 * потерял привязку между подсчётом и нажатием.
 */
export const readMailingAudience = async (
  activeWithinDays: number | null,
): Promise<MailingAudienceResponse> => {
  const counts = await countMailingAudience(activeWithinDays);

  return { activeWithinDays, ...counts };
};
