import { plainText } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import { findActiveLicenseNumber } from '#server/repositories/drivers';
import { findActiveProfilePhone, findDisplayProfile } from '#server/repositories/registry';
import { displayCallsign } from '#server/services/drivers/readLinkedDriver';
import { formatPhone } from '#shared/phone';
import type { MemberProfile, MemberProfileTexts } from '#shared/types/miniapp';

/**
 * Раздел «Профиль» (issue #216): кто залогинен. Водители работают «друг за друга», и менеджер
 * у стойки по этим полям понимает, чья учётка перед ним.
 *
 * Профиль читается тем же `findDisplayProfile`, что имя и позывной в шапке главной, — порядок
 * выбора между профилями один, и ФИО здесь не разойдётся с именем там.
 */

/** Имя и отчество одной строкой; пустое отчество не оставляет висящего пробела. */
const givenNamesOf = (firstName: string, middleName: string | null): string =>
  [firstName, middleName ?? '']
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(' ');

/**
 * Поля профиля. Чат приходит от вызывающего: это чат активной привязки, по которому человек
 * и найден, — читать его второй раз незачем.
 */
export const readMemberProfile = async (personId: string, telegramChatId: bigint): Promise<MemberProfile> => {
  const [profile, license] = await Promise.all([findDisplayProfile(personId), findActiveLicenseNumber(personId)]);
  const phoneRaw = profile === null ? null : await findActiveProfilePhone(profile.profileId);

  return {
    lastName: profile?.lastName.trim() ?? '',
    givenNames: profile === null ? '' : givenNamesOf(profile.firstName, profile.middleName),
    phone: phoneRaw === null ? null : formatPhone(phoneRaw),
    telegramId: telegramChatId.toString(),
    callsign: displayCallsign(profile?.callsign ?? null),
    license,
  };
};

/** Тексты раздела «Профиль» и его шторок на языке участника. */
export const memberProfileTexts = (language: Language): MemberProfileTexts => ({
  title: plainText('profile_title', language),
  // Те же ключи, что у «Покажите менеджеру» на регистрации: смысл один.
  phone: plainText('registration_phone_label', language),
  telegramId: plainText('registration_telegram_id_label', language),
  callsign: plainText('profile_callsign', language),
  license: plainText('profile_license', language),
  phoneMissing: plainText('profile_phone_missing', language),
  licenseShow: plainText('profile_license_show', language),
  licenseHide: plainText('profile_license_hide', language),
  settings: plainText('profile_settings', language),
  language: plainText('profile_language', language),
  reset: plainText('profile_reset', language),
  resetTitle: plainText('profile_reset_title', language),
  resetSubtitle: [plainText('profile_reset_note', language), plainText('profile_reset_kept', language)],
  resetConfirm: plainText('button_reset', language),
  resetCancel: plainText('button_cancel', language),
  languageSubtitle: plainText('language_sheet_subtitle', language),
  languageNames: {
    ru: plainText('language_name_ru', language),
    uz: plainText('language_name_uz', language),
  },
  save: plainText('button_save', language),
  close: plainText('button_close', language),
});
