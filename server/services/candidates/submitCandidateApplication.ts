import { consola } from 'consola';

import type { CandidatePhoneSource, Language } from '#server/generated/prisma/enums';
import {
  type CandidateApplicationRow,
  findOpenApplicationByPhone,
  findOpenApplicationByTelegram,
  insertCandidateApplication,
} from '#server/repositories/candidateApplications';
import { findEmployeeByTelegramOrPhone } from '#server/repositories/employees';
import { findActiveLinkByChat, findLastClosedLinkPerson } from '#server/repositories/programMembership';
import { readAdPromoCode } from '#server/services/candidates/adLaunch';
import { toApplicationView } from '#server/services/candidates/applicationScreen';
import { reconcileCandidatePhone } from '#server/services/candidates/reconcileCandidatePhone';
import { normalizePhoneE164 } from '#server/utils/phoneNumber';
import { checkContactData, type TelegramLaunch } from '#server/utils/telegramInitData';
import {
  type CandidateApplicationDenialCode,
  readCandidateName,
  readManualPhone,
} from '#shared/candidateApplications';
import type { MiniAppApplicationResponse } from '#shared/types/miniapp';

/**
 * Заявка кандидата из Mini App (issue #456): имя и номер человека, которого в программе нет.
 *
 * Заявка — не регистрация: водителя, привязки Telegram и участия она не создаёт
 * (docs/decisions.md → «Заявка кандидата»). Сверка номера с реестром заявку не останавливает —
 * итог пишется в неё, решает менеджер.
 *
 * Кто подаёт и по какой метке — только из проверенной `initData`; номер — из подписанной строки
 * контакта или, на Telegram без `requestContact`, введённый руками и ничем не подтверждённый.
 */

const log = consola.withTag('candidates:submit');

/** Отказ заявки — кодом из `shared/candidateApplications.ts`. Ответ HTTP из него собирает ручка. */
export class CandidateApplicationError extends Error {
  constructor(public readonly code: CandidateApplicationDenialCode) {
    super(`заявка кандидата отклонена: ${code}`);
    this.name = 'CandidateApplicationError';
  }
}

export type CandidateApplicationRequest = {
  launch: TelegramLaunch;
  name: string;
  contactData: string | null;
  manualPhone: string | null;
  writeAccessGranted: boolean;
  language: Language;
  /** Токен бота — им проверяется подпись строки контакта. */
  botToken: string;
  now: Date;
};

type ApplicationPhone = { raw: string; e164: string; source: CandidatePhoneSource };

/**
 * Номер заявки — ровно одно из двух: подписанная строка `requestContact` или девять цифр
 * после `+998`, введённые руками.
 */
const readApplicationPhone = (request: CandidateApplicationRequest): ApplicationPhone => {
  // Оба сразу — непонятно, какой номер записывать: клиент так не шлёт, и угадывать за него нечего.
  if (request.contactData !== null && request.manualPhone !== null) {
    throw new CandidateApplicationError('phone_invalid');
  }

  if (request.contactData !== null) {
    const contact = checkContactData({ contactData: request.contactData, token: request.botToken, now: request.now });

    if (contact.outcome === 'hash_mismatch' || contact.outcome === 'expired') {
      throw new CandidateApplicationError('contact_rejected');
    }

    if (contact.outcome !== 'valid') {
      throw new CandidateApplicationError('contact_missing');
    }

    // Строка контакта подтверждает номер, только если номером поделился тот, кто открыл
    // приложение: иначе знания чужого номера хватило бы, чтобы подать заявку от его имени
    // (docs/drivers.md → «Телефон подтверждает только сам владелец»).
    if (contact.contact.userId !== request.launch.user.id) {
      throw new CandidateApplicationError('contact_not_own');
    }

    const e164 = normalizePhoneE164(contact.contact.phoneNumber);

    if (e164 === null) {
      throw new CandidateApplicationError('phone_invalid');
    }

    return { raw: contact.contact.phoneNumber, e164, source: 'telegram_contact' };
  }

  if (request.manualPhone !== null) {
    const e164 = readManualPhone(request.manualPhone);

    if (e164 === null || normalizePhoneE164(e164) === null) {
      throw new CandidateApplicationError('phone_invalid');
    }

    return { raw: request.manualPhone, e164, source: 'manual' };
  }

  throw new CandidateApplicationError('contact_missing');
};

const respond = (
  outcome: MiniAppApplicationResponse['outcome'],
  row: CandidateApplicationRow,
  now: Date,
): MiniAppApplicationResponse => ({ outcome, ...toApplicationView(row, now), language: row.language });

export const submitCandidateApplication = async (
  request: CandidateApplicationRequest,
): Promise<MiniAppApplicationResponse> => {
  const { user } = request.launch;

  // Заявка подаётся только из рекламы в Telegram: остальные метки ведут в регистрацию.
  const promoCode = await readAdPromoCode(request.launch.startParam);

  if (promoCode === null) {
    throw new CandidateApplicationError('not_ad_launch');
  }

  // Участник подавать заявку не может: он уже в программе. Привязка ищется по чату — у перенесённых
  // из старой базы заполнен только он, а в личной переписке чат равен `user.id`.
  if (await findActiveLinkByChat(user.id)) {
    throw new CandidateApplicationError('member');
  }

  const name = readCandidateName(request.name);

  if (name === null) {
    throw new CandidateApplicationError('name_invalid');
  }

  const phone = readApplicationPhone(request);

  // Сотрудник парка заявку водителя не подаёт — та же проверка, что у регистрации.
  if (await findEmployeeByTelegramOrPhone(user.id, phone.e164)) {
    throw new CandidateApplicationError('employee');
  }

  // Открытая заявка одна на Telegram и одна на подтверждённый номер. Номер, введённый руками,
  // чужую заявку не закрывает — по нему и не ищется.
  const open =
    (await findOpenApplicationByTelegram(user.id)) ??
    (phone.source === 'telegram_contact' ? await findOpenApplicationByPhone(phone.e164) : null);

  if (open) {
    return respond('repeat', open, request.now);
  }

  const [reconciliation, formerLinkPersonId] = await Promise.all([
    reconcileCandidatePhone(phone.e164, request.now),
    findLastClosedLinkPerson(user.id),
  ]);

  const inserted = await insertCandidateApplication({
    channel: 'miniapp',
    telegramUserId: user.id,
    telegramChatId: user.id,
    telegramName: `${user.firstName} ${user.lastName}`.trim(),
    telegramUsername: user.username === '' ? null : user.username,
    name,
    phoneRaw: phone.raw,
    phoneE164: phone.e164,
    phoneSource: phone.source,
    writeAllowed: user.allowsWriteToPrivateMessages || request.writeAccessGranted,
    language: request.language,
    promoCode,
    match: reconciliation.match,
    matchedPersonId: reconciliation.personId,
    matchedProfileId: reconciliation.profileId,
    lastTripDay: reconciliation.lastTripDay,
    formerLinkPersonId,
  });

  if (inserted) {
    log.info('заявка кандидата', {
      telegramUserId: user.id.toString(),
      promoCode,
      match: reconciliation.match,
      phoneSource: phone.source,
    });

    return respond('accepted', inserted, request.now);
  }

  // Вставку отбил индекс открытой заявки: второе нажатие успело раньше. Ответ — та заявка.
  const raced =
    (await findOpenApplicationByTelegram(user.id)) ??
    (phone.source === 'telegram_contact' ? await findOpenApplicationByPhone(phone.e164) : null);

  if (!raced) {
    throw new Error('вставку заявки отбил индекс открытой заявки, а открытой заявки нет');
  }

  return respond('repeat', raced, request.now);
};
