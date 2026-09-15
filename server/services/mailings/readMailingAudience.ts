import { countMailingAudience } from '#server/repositories/mailings';
import type { MailingAudienceResponse } from '#shared/types/mailing';

/**
 * Сколько человек получит рассылку, если запустить её сейчас: все участники программы
 * с активной привязкой Telegram, фильтров нет.
 *
 * Тем же отбором, которым запуск снимает снимок (server/repositories/mailings.ts): число
 * на экране и число строк снимка расходятся только на тех, кто вступил в программу или
 * потерял привязку между подсчётом и нажатием.
 */
export const readMailingAudience = async (): Promise<MailingAudienceResponse> =>
  countMailingAudience();
