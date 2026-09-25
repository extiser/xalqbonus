import type { Language } from '#server/generated/prisma/enums';
import { updatePersonLanguage } from '#server/repositories/programMembership';

/**
 * Смена языка участником — из профиля, после регистрации (issue #216).
 *
 * Пишется одна колонка `person_settings.language`. Больше ничего менять не нужно: экран
 * берёт язык оттуда при каждом чтении, уведомления — в момент отправки
 * (server/services/notifications/sendNotification.ts).
 *
 * Строки участия нет — это не отказ человеку, а поломка: `requireMember` пустил его как
 * участника, а участия у него нет. Молча ответить успехом значило бы соврать, что язык записан.
 */
export const changeMemberLanguage = async (personId: string, language: Language): Promise<Language> => {
  if (!(await updatePersonLanguage(personId, language))) {
    throw new Error(`у участника ${personId} нет строки person_settings — язык записать некуда`);
  }

  return language;
};
