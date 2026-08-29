import {
  findPerson,
  findPersonSettings,
  listPersonLicenses,
  listPersonParkProfiles,
  listPersonPhones,
  listPersonTelegramLinks,
  type ParkProfileRow,
  type PersonLicenseRow,
  type ProfilePhoneRow,
} from '#server/repositories/drivers';
import { findDriverAccountReconciliation } from '#server/repositories/points';
import type {
  DriverBalance,
  DriverCardResponse,
  DriverLicense,
  DriverParkProfile,
  DriverPhone,
} from '#shared/types/driver';

/**
 * Карточка водителя: человек, его учётки в парке, каналы связи, участие в программе
 * и счёт со сверкой.
 *
 * Собирается тремя уровнями личности, а не одним (docs/drivers.md): человек — номер ВУ,
 * учётка — `profile_id`, канал — телефон и Telegram. Смешение этих уровней и породило
 * двенадцать двойных записей в старом проекте, поэтому карточка показывает их порознь
 * и все сразу.
 *
 * Не участник программы карточкой тоже открывается: пустые разделы приезжают пустыми,
 * а подпись причины рисует экран. Пустая карточка здесь — содержательный ответ,
 * а не ошибка (issue #35).
 */

const toLicense = (row: PersonLicenseRow): DriverLicense => ({
  numberRaw: row.numberRaw,
  numberCanonical: row.numberCanonical,
  country: row.country,
  issueDate: row.issueDate,
  expirationDate: row.expirationDate,
  observedAt: row.observedAt.toISOString(),
  closedAt: row.closedAt?.toISOString() ?? null,
  source: row.source,
});

const toPhone = (row: ProfilePhoneRow): DriverPhone => ({
  phoneRaw: row.phoneRaw,
  phoneE164: row.phoneE164,
  observedAt: row.observedAt.toISOString(),
  closedAt: row.closedAt?.toISOString() ?? null,
});

const toProfile = (row: ParkProfileRow, phones: DriverPhone[]): DriverParkProfile => ({
  profileId: row.profileId,
  parkId: row.parkId,
  firstName: row.firstName,
  lastName: row.lastName,
  middleName: row.middleName,
  workStatus: row.workStatus,
  employmentType: row.employmentType,
  workRuleName: row.workRuleName,
  hireDate: row.hireDate,
  fireDate: row.fireDate,
  currentStatus: row.currentStatus,
  currentStatusUpdatedAt: row.currentStatusUpdatedAt?.toISOString() ?? null,
  callsign: row.callsign,
  carNumber: row.carNumber,
  carBrandModel: row.carBrandModel,
  firstSeenAt: row.firstSeenAt.toISOString(),
  lastSyncedAt: row.lastSyncedAt.toISOString(),
  phones,
  tripsTotal: row.tripsTotal,
  lastTripEndedAt: row.lastTripEndedAt?.toISOString() ?? null,
});

/** Телефоны раскладываются по учёткам: телефон принадлежит профилю, а не человеку. */
const groupPhonesByProfile = (rows: ProfilePhoneRow[]): Map<string, DriverPhone[]> => {
  const grouped = new Map<string, DriverPhone[]>();

  for (const row of rows) {
    const phones = grouped.get(row.profileId) ?? [];

    phones.push(toPhone(row));
    grouped.set(row.profileId, phones);
  }

  return grouped;
};

export const readDriverCard = async (personId: string): Promise<DriverCardResponse | null> => {
  const person = await findPerson(personId);

  if (!person) {
    return null;
  }

  const [licenses, profiles, phones, telegramLinks, settings, reconciliation] = await Promise.all([
    listPersonLicenses(personId),
    listPersonParkProfiles(personId),
    listPersonPhones(personId),
    listPersonTelegramLinks(personId),
    findPersonSettings(personId),
    findDriverAccountReconciliation(personId),
  ]);

  const phonesByProfile = groupPhonesByProfile(phones);

  const balance: DriverBalance | null = reconciliation
    ? {
        accountId: reconciliation.accountId,
        cachedBalance: Number(reconciliation.cachedBalance),
        journalBalance: Number(reconciliation.journalBalance),
        // Считается здесь, а не на экране: расхождение кэша с журналом — утверждение
        // о состоянии системы, и считать его в разметке значит считать его дважды,
        // когда карточку откроет второй экран.
        difference: Number(reconciliation.cachedBalance - reconciliation.journalBalance),
        entriesCount: reconciliation.entriesCount,
        firstEntryAt: reconciliation.firstEntryAt?.toISOString() ?? null,
        lastEntryAt: reconciliation.lastEntryAt?.toISOString() ?? null,
      }
    : null;

  return {
    personId: person.personId,
    createdAt: person.createdAt.toISOString(),
    activeLicense: licenses.filter((license) => license.closedAt === null).map(toLicense)[0] ?? null,
    formerLicenses: licenses.filter((license) => license.closedAt !== null).map(toLicense),
    profiles: profiles.map((profile) =>
      toProfile(profile, phonesByProfile.get(profile.profileId) ?? []),
    ),
    telegramLinks: telegramLinks.map((link) => ({
      telegramChatId: link.telegramChatId,
      telegramUserId: link.telegramUserId,
      linkedAt: link.linkedAt.toISOString(),
      closedAt: link.closedAt?.toISOString() ?? null,
      closeReason: link.closeReason,
      confirmedBy: link.confirmedBy,
      operatorRef: link.operatorRef,
    })),
    membership: settings
      ? {
          joinedAt: settings.joinedAt.toISOString(),
          joinedSource: settings.joinedSource,
          language: settings.language,
          notificationsEnabled: settings.notificationsEnabled,
        }
      : null,
    balance,
  };
};
