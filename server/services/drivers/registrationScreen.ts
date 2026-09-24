import { plainText, type TextKey } from '#server/bot/texts';
import type { Language, LinkAttemptOutcome } from '#server/generated/prisma/enums';
import type { RegistrationResult } from '#server/services/drivers/registerDriverByContact';
import { readMemberOffices } from '#server/services/offices/readMemberOffices';
import { formatPhone } from '#shared/phone';
import type {
  MiniAppRegisterResponse,
  RegistrationRefusalKind,
  RegistrationScreenTexts,
} from '#shared/types/miniapp';

/**
 * Что водитель видит на экранах регистрации: тексты экранов и ответ на исход попытки.
 *
 * Решений здесь нет ни одного — они приняты в `registerDriverByContact`. Здесь исход
 * превращается в текст и вид экрана, и живёт это отдельным модулем, потому что вызывающих
 * у него несколько: ручка состояния, ручка регистрации и экран выключенного сотрудника.
 *
 * Тексты берутся из `server/bot/texts.ts` — те самые, что писались в `#77`. Переезд
 * регистрации в Mini App их не переписывает и не сокращает: причины отказа разведены
 * ровно потому, что часть из них решается не походом через город, а нажатием, и узнать
 * об этом водитель может только из ответа.
 */

/** Отказ: всё, кроме удачи. Удача устроена иначе — экран участника перечитывается целиком. */
type RefusalOutcome = Exclude<LinkAttemptOutcome, 'linked'>;

/**
 * Текст на каждый отказ и экран, которым он показывается.
 *
 * Одной таблицей, а не цепочкой `if`: ответ у всех отказов устроен одинаково и отличается
 * ровно двумя вещами — ключом текста и видом экрана.
 *
 * Полнота таблицы стоит вместо запасного текста и является единственной настоящей защитой:
 * новое значение `LinkAttemptOutcome` обязано сломать сборку здесь и заставить написать
 * текст. Запасное «подойдите в офис» сломать ничего не может — оно молча вернуло бы ровно
 * то общее сообщение, ради избавления от которого заведён `#77`.
 *
 * `retry` — исходы, после которых повтор тем же нажатием осмыслен: водитель поделился
 * не своим контактом или проверка не прошла — на стороне парка либо на нашей. Под всеми
 * остальными кнопки нет: она звала бы в действие, которое даст тот же ответ. Это то же
 * решение, что снимало клавиатуру запроса контакта в боте, — и принято оно было там по той
 * же причине.
 *
 * У двух исходов проверки один ключ текста на двоих намеренно: в журнале они разведены, потому
 * что разбору нужно «их сторона или наша», а водителю разница не видна и видна быть
 * не должна — действие у него одно, подождать и нажать ещё раз (issue #95).
 *
 * `employee` — контакт сотрудника парка: без офисов, он в офисе и так работает.
 */
const REFUSALS: Readonly<Record<RefusalOutcome, { key: TextKey; kind: RegistrationRefusalKind }>> = {
  contact_not_own: { key: 'contact_not_own', kind: 'retry' },
  park_api_unavailable: { key: 'check_unavailable', kind: 'retry' },
  internal_failure: { key: 'check_unavailable', kind: 'retry' },
  employee_account: { key: 'employee_account', kind: 'employee' },
  not_in_registry: { key: 'not_in_registry', kind: 'office' },
  not_in_park: { key: 'not_in_park', kind: 'office' },
  profile_fired: { key: 'profile_fired', kind: 'office' },
  several_profiles: { key: 'several_profiles', kind: 'office' },
  person_already_linked: { key: 'person_already_linked', kind: 'office' },
  telegram_already_linked: { key: 'telegram_already_linked', kind: 'office' },
  link_closed_in_history: { key: 'link_closed_in_history', kind: 'office' },
};

/** Тексты регистрации на одном языке. */
const screenTexts = (language: Language): RegistrationScreenTexts => ({
  welcomeTitle: plainText('registration_welcome_title', language),
  welcomeLead: plainText('registration_welcome_lead', language),
  selectLanguage: plainText('select_language', language),
  languageUz: plainText('button_language_uz', language),
  languageRu: plainText('button_language_ru', language),
  title: plainText('registration_title', language),
  lead: plainText('registration_lead', language),
  perks: [
    plainText('registration_perk_auto', language),
    plainText('registration_perk_gifts', language),
    plainText('registration_perk_chests', language),
  ],
  ask: plainText('ask_phone', language),
  send: plainText('miniapp_send_phone', language),
  checking: plainText('checking_phone', language),
  officeTitle: plainText('registration_office_title', language),
  retryTitle: plainText('registration_retry_title', language),
  retryNote: plainText('registration_retry_note', language),
  retrySend: plainText('registration_retry_send', language),
  retryFailed: plainText('registration_retry_failed', language),
  idsTitle: plainText('registration_ids_title', language),
  phoneLabel: plainText('registration_phone_label', language),
  telegramIdLabel: plainText('registration_telegram_id_label', language),
  copyPhone: plainText('registration_copy_phone', language),
  copyTelegramId: plainText('registration_copy_telegram_id', language),
  officesTitle: plainText('registration_offices_title', language),
  officeLabel: plainText('office_label', language),
  mapLabel: plainText('office_map', language),
  outdatedClientTitle: plainText('client_outdated_title', language),
  outdatedClient: plainText('client_outdated', language),
  employeeDeniedTitle: plainText('employee_denied_title', language),
  employeeDeniedText: plainText('employee_denied_text', language),
});

/**
 * Тексты регистрации на обоих языках сразу.
 *
 * Оба, потому что шаг 1 показывает оба языка, а на следующих экранах переключатель стоит
 * на самом экране: сходить за вторым языком на сервер значит показать человеку задумавшийся
 * экран в ответ на нажатие, которое ничего не решает.
 */
export const registrationScreenTexts = (): Record<Language, RegistrationScreenTexts> => ({
  ru: screenTexts('ru'),
  uz: screenTexts('uz'),
});

/**
 * Ответ водителю на исход попытки привязки.
 *
 * Номер и Telegram ID уходят на экран у каждого отказа — даже номер, которого в парке нет:
 * это единственное, по чему менеджер найдёт попытку. Номер — тот, что прислал контакт,
 * а не приведённый: у `contact_not_own` и у номера не в узбекской форме приведённого нет.
 *
 * Офисы — работающие, из таблицы `Office`: у `office` и `retry`. Повтор без офисов оставил
 * бы человека, у которого не выходит с нескольких попыток, без адреса.
 */
export const describeRegistrationResult = async ({
  result,
  language,
  phoneRaw,
  telegramUserId,
}: {
  result: RegistrationResult;
  /** Язык, выбранный при отправке. */
  language: Language;
  /** Номер из проверенной строки контакта, как пришёл. */
  phoneRaw: string;
  telegramUserId: bigint;
}): Promise<MiniAppRegisterResponse> => {
  if (result.outcome === 'linked') {
    return { outcome: 'linked' };
  }

  const refusal = REFUSALS[result.outcome];
  const offices = refusal.kind === 'employee' ? [] : (await readMemberOffices()).offices;

  return {
    outcome: result.outcome,
    kind: refusal.kind,
    language,
    message: {
      ru: plainText(refusal.key, 'ru'),
      uz: plainText(refusal.key, 'uz'),
    },
    phone: formatPhone(phoneRaw),
    telegramId: telegramUserId.toString(),
    offices,
  };
};
