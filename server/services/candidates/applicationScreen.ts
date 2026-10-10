import { getBotUsername } from '#server/adapters/telegram/botIdentity';
import { readBotToken } from '#server/bot/config';
import { plainText } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import { type CandidateApplicationRow, findOpenApplicationByTelegram } from '#server/repositories/candidateApplications';
import { readAdPromoCode } from '#server/services/candidates/adLaunch';
import { buildBotChatLink } from '#server/services/employees/employeeLinks';
import { readMemberOffices } from '#server/services/offices/readMemberOffices';
import { WELCOME_BONUS_POINTS, WELCOME_TRIPS_REQUIRED } from '#server/services/points/awardWelcomeBonus';
import { formatDayKey, formatDayMonthWord, previousDayKey } from '#server/utils/parkTime';
import type { TelegramLaunch } from '#server/utils/telegramInitData';
import { formatPhone } from '#shared/phone';
import type {
  ApplicationScreenTexts,
  CandidateApplicationView,
  MiniAppApplicationScreen,
  MiniAppApplicationSentScreen,
} from '#shared/types/miniapp';

/**
 * Что видит кандидат (issue #456): экран заявки и «Заявка уже отправлена» — тексты, офисы и чат
 * «Написать менеджеру».
 *
 * Тексты — из словаря `server/bot/texts.ts`, на обоих языках сразу: переключатель на экране
 * работает без запроса, как у регистрации.
 */

/** Тексты заявки на одном языке. Числа строки условий — из приветственного бонуса, а не из словаря. */
const screenTexts = (language: Language): ApplicationScreenTexts => ({
  title: plainText('application_title', language),
  lead: plainText('application_lead', language),
  nameLabel: plainText('application_name_label', language),
  namePlaceholder: plainText('application_name_placeholder', language),
  phoneLabel: plainText('application_phone_label', language),
  ask: plainText('application_ask', language),
  declined: plainText('application_declined', language),
  send: plainText('application_send', language),
  sending: plainText('application_sending', language),
  termsCommission: plainText('application_terms_commission', language),
  termsCommissionNote: plainText('application_terms_commission_note', language),
  termsBonus: plainText('application_terms_bonus', language, { points: String(WELCOME_BONUS_POINTS) }),
  termsBonusNote: plainText('application_terms_bonus_note', language, { trips: String(WELCOME_TRIPS_REQUIRED) }),
  termsLegend: plainText('application_terms_legend', language),
  // Подстановки `{name}`, `{phone}` и `{date}` остаются в строке: их ставит экран.
  acceptedTitle: plainText('application_accepted_title', language),
  leadWrite: plainText('application_lead_write', language),
  leadCall: plainText('application_lead_call', language),
  repeatTitle: plainText('application_repeat_title', language),
  repeatLeadWrite: plainText('application_repeat_lead_write', language),
  repeatLeadCall: plainText('application_repeat_lead_call', language),
  dateToday: plainText('application_date_today', language),
  dateYesterday: plainText('application_date_yesterday', language),
  dateDay: plainText('application_date_day', language),
  failedTitle: plainText('application_failed_title', language),
  failedLead: plainText('application_failed_lead', language),
  failedSend: plainText('application_failed_send', language),
  failedError: plainText('application_failed_error', language),
  officeTitle: plainText('application_office_title', language),
  officeLabel: plainText('office_label', language),
  mapLabel: plainText('office_map', language),
  writeManager: plainText('application_write_manager', language),
});

export const applicationScreenTexts = (): Record<Language, ApplicationScreenTexts> => ({
  ru: screenTexts('ru'),
  uz: screenTexts('uz'),
});

/**
 * День заявки на «Заявка уже отправлена» одним языком: сегодня и вчера — словами, иначе день
 * и месяц словом. Сутки — по Ташкенту, как у всего, что видит водитель.
 */
const submittedDay = (submittedAt: Date, language: Language, now: Date): string => {
  const day = formatDayKey(submittedAt);

  if (day === formatDayKey(now)) {
    return plainText('application_date_today', language);
  }

  if (day === previousDayKey(now)) {
    return plainText('application_date_yesterday', language);
  }

  // Неразрывно: «8 октября» не разрывается переносом строки.
  return plainText('application_date_day', language, {
    date: formatDayMonthWord(submittedAt, language).replaceAll(' ', '\u00A0'),
  });
};

/**
 * День заявки словом на обоих языках. Здесь, а не на экране: экран старого движка на ES5
 * даты не форматирует, и правило у обоих экранов одно (issue #460).
 */
export const submittedDayText = (submittedAt: Date, now: Date): Record<Language, string> => ({
  ru: submittedDay(submittedAt, 'ru', now),
  uz: submittedDay(submittedAt, 'uz', now),
});

/** Заявка для экрана: номер — в показном виде, день заявки — готовым словом. */
export const toApplicationView = (row: CandidateApplicationRow, now: Date): CandidateApplicationView => ({
  name: row.name,
  phone: formatPhone(row.phoneE164).display,
  submittedAtText: submittedDayText(row.createdAt, now),
  writeAllowed: row.writeAllowed,
});

/**
 * Язык экрана заявки до выбора человеком — по языку Telegram: узбекский, если код начинается
 * с `uz`, иначе русский. Шага выбора языка у заявки нет, переключатель — в шапке.
 */
const launchLanguage = (languageCode: string): Language => (languageCode.startsWith('uz') ? 'uz' : 'ru');

/** Общее у экранов заявки. Кандидат не демо: офисы — живые, как на исходе регистрации. */
const readScreenBase = async () => {
  const [{ offices }, botUsername] = await Promise.all([
    readMemberOffices({ isDemo: false }),
    getBotUsername(readBotToken()),
  ]);

  return { texts: applicationScreenTexts(), offices, managerChatUrl: buildBotChatLink(botUsername) };
};

/**
 * Экран заявки для того, кто не участник и не сотрудник. `null` — не про заявку: показывается
 * регистрация.
 *
 * Открытая заявка этого Telegram — «Заявка уже отправлена» с меткой и без: кандидат мог открыть
 * приложение потом кнопкой меню бота. Иначе экран заявки — только по метке рекламы в Telegram.
 */
export const readApplicationScreen = async (
  launch: TelegramLaunch,
  now: Date,
): Promise<MiniAppApplicationScreen | MiniAppApplicationSentScreen | null> => {
  const open = await findOpenApplicationByTelegram(launch.user.id);

  if (open) {
    return {
      screen: 'application_sent',
      ...(await readScreenBase()),
      ...toApplicationView(open, now),
      language: open.language,
    };
  }

  if ((await readAdPromoCode(launch.startParam)) === null) {
    return null;
  }

  return {
    screen: 'application',
    ...(await readScreenBase()),
    language: launchLanguage(launch.user.languageCode),
  };
};
