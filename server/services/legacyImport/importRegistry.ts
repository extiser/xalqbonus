import { consola } from 'consola';

import { readRegistryDump, type RegistryProfile } from '#server/adapters/fleet/registryDump';
import {
  countPersonsWithSeveralProfiles,
  ensurePersonsForLicenses,
  insertActiveProfilePhones,
  insertInitialStatusEvents,
  upsertParkProfiles,
  type ParkProfileInput,
  type PersonLicenseInput,
  type ProfilePhoneInput,
} from '#server/repositories/registry';
import { normalizeLicenseNumber } from '#server/utils/licenseNumber';

/**
 * Шаги 1–2 переноса: люди с удостоверениями и профили парка.
 *
 * Реестр — это все, кого знает парк, включая уволенных и никогда не открывавших бота.
 * Участие в программе начинается строкой `person_settings` и заводится другим шагом:
 * первое живёт без второго, обратное невозможно (docs/drivers.md).
 */

const log = consola.withTag('legacy-import:registry');

/** Источник строки журнала удостоверений: реестр парка, а не старая база. */
const LICENSE_SOURCE = 'fleet_api';

/** Форма, по которой заполняется нормализованный телефон. 446 номеров реестра ей не отвечают. */
const E164_UZBEKISTAN = /^\+998\d{9}$/;

export type RegistryImportSummary = {
  profilesSeen: number;
  personsTotal: number;
  personsWithSeveralProfiles: number;
  phonesWritten: number;
  profilesWithoutPhone: number;
  phonesOutsideE164: number;
  statusEventsWritten: number;
};

/**
 * Профиль без номера ВУ. В выгрузке таких ноль, и появившийся — повод остановиться:
 * человек опознаётся номером удостоверения, и завести его без номера значит завести
 * личность, которую никогда не найти повторным прогоном.
 */
export class ProfileWithoutLicenseError extends Error {
  constructor(public readonly profileId: string, public readonly numberRaw: string) {
    super(
      `у профиля ${profileId} номер ВУ «${numberRaw}» после нормализации пуст — человека без удостоверения перенос не заводит`,
    );
    this.name = 'ProfileWithoutLicenseError';
  }
}

/** Группа профилей одного человека: канонический номер и все учётки под ним. */
type LicenseGroup = {
  license: PersonLicenseInput;
  profiles: RegistryProfile[];
};

/**
 * Собирает профили в группы по каноническому номеру — до того, как заводить людей.
 *
 * Группировка обязательна, а не желательна: 672 номера принадлежат 1 380 профилям,
 * и без неё уникальный индекс `person_licenses_active_number_key` отобьёт вторую активную
 * строку с тем же номером — прогон упадёт в середине. Ровно эти же группы склеивают
 * четыре пары двойников, которых `profile_id` не ловит в принципе (docs/drivers.md).
 */
const groupByCanonicalLicense = (profiles: readonly RegistryProfile[]): Map<string, LicenseGroup> => {
  const groups = new Map<string, LicenseGroup>();

  for (const profile of profiles) {
    const numberCanonical = normalizeLicenseNumber(profile.license.numberRaw).trim();

    if (numberCanonical === '') {
      throw new ProfileWithoutLicenseError(profile.profileId, profile.license.numberRaw);
    }

    const existing = groups.get(numberCanonical);

    if (existing) {
      existing.profiles.push(profile);
      continue;
    }

    groups.set(numberCanonical, {
      license: {
        numberCanonical,
        numberRaw: profile.license.numberRaw,
        country: profile.license.country,
        issueDate: profile.license.issueDate,
        expirationDate: profile.license.expirationDate,
      },
      profiles: [profile],
    });
  }

  // Внутри группы written-строка удостоверения берётся у профиля с наименьшим
  // идентификатором, а не у первого встреченного: порядок строк в выгрузке не гарантирован,
  // и повторный прогон обязан выбрать тот же профиль.
  for (const group of groups.values()) {
    group.profiles.sort((left, right) => left.profileId.localeCompare(right.profileId));

    const [primary] = group.profiles;

    if (primary) {
      group.license.numberRaw = primary.license.numberRaw;
      group.license.country = primary.license.country;
      group.license.issueDate = primary.license.issueDate;
      group.license.expirationDate = primary.license.expirationDate;
    }
  }

  return groups;
};

const buildPhoneRows = (profiles: readonly RegistryProfile[]): ProfilePhoneInput[] =>
  profiles.flatMap((profile) =>
    profile.phones.map((phoneRaw) => ({
      profileId: profile.profileId,
      phoneRaw,
      phoneE164: E164_UZBEKISTAN.test(phoneRaw) ? phoneRaw : null,
    })),
  );

export const importRegistry = async (
  dumpPath: string,
  syncedAt: Date,
): Promise<RegistryImportSummary> => {
  const profiles: RegistryProfile[] = [];

  for await (const profile of readRegistryDump(dumpPath)) {
    profiles.push(profile);
  }

  log.info(`прочитано профилей: ${profiles.length}`);

  const groups = groupByCanonicalLicense(profiles);

  log.info(`различных канонических номеров ВУ: ${groups.size}`);

  const personIdsByLicense = await ensurePersonsForLicenses(
    [...groups.values()].map((group) => group.license),
    LICENSE_SOURCE,
  );

  const profileRows: ParkProfileInput[] = [];

  for (const [numberCanonical, group] of groups) {
    const personId = personIdsByLicense.get(numberCanonical);

    if (!personId) {
      throw new Error(`человек по номеру ${numberCanonical} не завёлся — прогон остановлен`);
    }

    for (const profile of group.profiles) {
      profileRows.push({ ...profile, personId });
    }
  }

  await upsertParkProfiles(profileRows, syncedAt);

  const phoneRows = buildPhoneRows(profiles);

  await insertActiveProfilePhones(phoneRows);

  const statusEventsWritten = await insertInitialStatusEvents(
    profiles.map((profile) => ({ profileId: profile.profileId, statusTo: profile.workStatus })),
  );

  return {
    profilesSeen: profiles.length,
    personsTotal: groups.size,
    personsWithSeveralProfiles: await countPersonsWithSeveralProfiles(),
    phonesWritten: phoneRows.length,
    profilesWithoutPhone: profiles.filter((profile) => profile.phones.length === 0).length,
    phonesOutsideE164: phoneRows.filter((phone) => phone.phoneE164 === null).length,
    statusEventsWritten,
  };
};
