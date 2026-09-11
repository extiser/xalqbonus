import { formatPoints, officeContacts, plainText, type TextKey } from '#server/bot/texts';
import type { Language, LinkAttemptOutcome } from '#server/generated/prisma/enums';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import type { RegistrationResult } from '#server/services/drivers/registerDriverByContact';
import type {
  MiniAppRegisterResponse,
  RegistrationScreenTexts,
} from '#shared/types/miniapp';

/**
 * Что водитель видит на экране регистрации: тексты экрана и ответ на исход попытки.
 *
 * Решений здесь нет ни одного — они приняты в `registerDriverByContact`. Здесь исход
 * превращается в строку на языке водителя, и живёт это отдельным модулем, потому что
 * у него два вызывающих: ручка состояния и ручка регистрации.
 *
 * Тексты берутся из `server/bot/texts.ts` — те самые, что писались в `#77`. Переезд
 * регистрации в Mini App их не переписывает и не сокращает: причины отказа разведены
 * ровно потому, что часть из них решается не походом через город, а нажатием, и узнать
 * об этом водитель может только из ответа.
 */

/** Отказ: всё, кроме удачи. Удача устроена иначе — у неё есть имя и баланс. */
type RefusalOutcome = Exclude<LinkAttemptOutcome, 'linked'>;

/**
 * Текст на каждый отказ и нужен ли под ним список офисов.
 *
 * Одной таблицей, а не цепочкой `if`: ответ у всех отказов устроен одинаково и отличается
 * ровно двумя вещами — ключом текста и тем, зовёт ли исход в офис.
 *
 * Полнота таблицы стоит вместо запасного текста и является единственной настоящей защитой:
 * новое значение `LinkAttemptOutcome` обязано сломать сборку здесь и заставить написать
 * текст. Запасное «подойдите в офис» сломать ничего не может — оно молча вернуло бы ровно
 * то общее сообщение, ради избавления от которого заведён `#77`.
 *
 * Без офисов три исхода, и у каждого своя причина. Чужой контакт чинится второй попыткой.
 * Сотрудник парка в офисе и так работает. А молчащий Fleet API — это сломались мы,
 * и посылать за это человека через город значит создавать поход, который не был нужен.
 */
const REFUSALS: Readonly<Record<RefusalOutcome, { key: TextKey; withOffices: boolean }>> = {
  contact_not_own: { key: 'contact_not_own', withOffices: false },
  employee_account: { key: 'employee_account', withOffices: false },
  park_api_unavailable: { key: 'park_api_unavailable', withOffices: false },
  not_in_registry: { key: 'not_in_registry', withOffices: true },
  not_in_park: { key: 'not_in_park', withOffices: true },
  profile_fired: { key: 'profile_fired', withOffices: true },
  several_profiles: { key: 'several_profiles', withOffices: true },
  person_already_linked: { key: 'person_already_linked', withOffices: true },
  telegram_already_linked: { key: 'telegram_already_linked', withOffices: true },
  link_closed_in_history: { key: 'link_closed_in_history', withOffices: true },
};

/**
 * Исходы, после которых повтор тем же нажатием осмыслен.
 *
 * Водитель поделился не своим контактом или напоролся на молчащий Fleet API — оба чинятся
 * второй попыткой, и обе идут той же кнопкой. Под всеми остальными кнопка гаснет: она
 * звала бы в действие, которое даст тот же ответ. Это то же решение, что снимало
 * клавиатуру запроса контакта в боте, — и принято оно было там по той же причине.
 */
const RETRYABLE_OUTCOMES: ReadonlySet<LinkAttemptOutcome> = new Set<LinkAttemptOutcome>([
  'contact_not_own',
  'park_api_unavailable',
]);

/** Приветствие участника: имя и баланс. Тем же текстом, которым отвечало главное меню бота. */
export const describeMember = (driver: LinkedDriver): string =>
  plainText('linked', driver.language, {
    name: driver.name,
    points: formatPoints(driver.points),
  });

/** Тексты экрана регистрации на одном языке. */
const screenTexts = (language: Language): RegistrationScreenTexts => ({
  selectLanguage: plainText('select_language', language),
  languageRu: plainText('button_language_ru', language),
  languageUz: plainText('button_language_uz', language),
  askPhone: plainText('ask_phone', language),
  sendPhone: plainText('button_send_phone', language),
  checkingPhone: plainText('checking_phone', language),
  outdatedClient: plainText('client_outdated', language),
});

/**
 * Тексты экрана регистрации на обоих языках сразу.
 *
 * Оба, потому что переключатель языка стоит на самом экране: сходить за вторым языком
 * на сервер значит показать человеку задумавшийся экран в ответ на нажатие, которое
 * ничего не решает.
 */
export const registrationScreenTexts = (): Record<Language, RegistrationScreenTexts> => ({
  ru: screenTexts('ru'),
  uz: screenTexts('uz'),
});

/**
 * Ответ водителю на исход попытки привязки.
 *
 * Язык удачи — язык участника, а не выбранный сейчас: у перенесённого из старой базы язык
 * в `person_settings` не перезаписывается, и экран успеха обязан говорить на том же,
 * на котором заговорит следующее сообщение.
 */
export const describeRegistrationResult = (
  result: RegistrationResult,
  chosenLanguage: Language,
): MiniAppRegisterResponse => {
  if (result.outcome === 'linked') {
    // Приветственный текст с обещанием бонуса — только новому участнику. Перенесённому
    // из старой базы показывается его баланс: обещать ему первые пять поездок незачем.
    const key: TextKey = result.isNewMember ? 'linked_new' : 'linked';

    return {
      outcome: 'linked',
      language: result.driver.language,
      message: plainText(key, result.driver.language, {
        name: result.driver.name,
        points: formatPoints(result.driver.points),
      }),
      offices: [],
      canRetry: false,
    };
  }

  const refusal = REFUSALS[result.outcome];

  return {
    outcome: result.outcome,
    language: chosenLanguage,
    message: plainText(refusal.key, chosenLanguage),
    offices: refusal.withOffices ? officeContacts(chosenLanguage) : [],
    canRetry: RETRYABLE_OUTCOMES.has(result.outcome),
  };
};
