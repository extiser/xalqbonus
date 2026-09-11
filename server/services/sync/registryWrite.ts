import { consola } from 'consola';

import type { ProfilesPage } from '#server/adapters/fleet/profiles';
import type { MalformedProfile, RegistryProfile } from '#server/adapters/fleet/registryProfile';
import {
  closeProfilePhones,
  ensurePersonsForNewProfiles,
  insertProfileStatusEvents,
  insertActiveProfilePhones,
  readActiveLicenses,
  readActiveProfilePhones,
  readPersonIdsByLicenseNumbers,
  readProfileStates,
  replacePersonLicense,
  upsertParkProfiles,
  type ParkProfileInput,
  type PersonLicenseInput,
  type ProfilePhoneInput,
  type ProfilePhoneRow,
  type ProfileStatusChange,
} from '#server/repositories/registry';
import type { SyncRunRegistryCounters } from '#server/repositories/syncRunRegistry';
import { recordSyncSkips, resolveSkipsForProfiles, type SyncSkipInput } from '#server/repositories/syncSkips';
import { normalizeLicenseNumber } from '#server/utils/licenseNumber';
import { normalizePhoneE164 } from '#server/utils/phoneNumber';

/**
 * Запись реестра парка: единственный путь, которым в базе появляются человек, профиль
 * и всё, что за ними тянется.
 *
 * Отдельным модулем, потому что писателей вызывает двое — плановый обход
 * (`syncRegistry.ts`) и точечный прогон по телефону (`syncProfileByPhone.ts`), — а место
 * записи обязано остаться одно. У профиля много полей, и два писателя однажды запишут
 * их по-разному: разойдутся нормализация номера, порядок закрытия телефонов, правило
 * заведения человека — и реестр начнёт зависеть от того, каким входом в него попали.
 *
 * Обхода и пагинации здесь нет: как добыть страницу — дело того, кто зовёт. Здесь только
 * то, что делается с уже разобранной страницей.
 *
 * Участие в программе тут не заводится и не трогается: реестр — это все, кого знает парк,
 * а участие начинается привязкой Telegram (docs/drivers.md).
 */

const log = consola.withTag('sync:registry');

/** Источник строки журнала удостоверений: реестр парка, а не старая база. */
const LICENSE_SOURCE = 'fleet_api';

/**
 * Сколько идентификаторов пропущенного показывать в сводке.
 *
 * Ограничение лога и только лога: в `xb.sync_skips` едет всё до единого, поимённо
 * и без обрезки — то, что за пятидесятым, иначе не было бы названо нигде и никогда.
 */
export const SAMPLE_LIMIT = 50;

/**
 * Числовые счётчики прогона.
 *
 * Профилей здесь нет намеренно: их считают множества `RunProfiles`. Профиль приходит
 * дважды на каждом куске, который берётся с двух концов, и сложение строк ответа выдавало
 * бы «обновлено 29 345» при 25 391 профиле в парке.
 */
export type Counters = {
  pages: number;
  /** Строк в ответах API. Цена нарезки, а не размер парка. */
  responseRows: number;
  personsCreated: number;
  statusEvents: number;
  phonesOpened: number;
  phonesClosed: number;
  licensesUpdated: number;
  licenseConflicts: number;
  skippedWithoutLicense: number;
  malformed: number;
  resolvedSkips: number;
  chunksTotal: number;
  chunksWindowed: number;
  maxOffsetDepth: number;
};

const emptyCounters = (): Counters => ({
  pages: 0,
  responseRows: 0,
  personsCreated: 0,
  statusEvents: 0,
  phonesOpened: 0,
  phonesClosed: 0,
  licensesUpdated: 0,
  licenseConflicts: 0,
  skippedWithoutLicense: 0,
  malformed: 0,
  resolvedSkips: 0,
  chunksTotal: 0,
  chunksWindowed: 0,
  maxOffsetDepth: 0,
});

/**
 * Различные профили прогона — тремя множествами, а не тремя числами.
 *
 * Проходы с двух концов перекрываются намеренно, и один профиль приезжает дважды.
 * Сложением строк ответа получилось бы, что прогон видел парк больше раз, чем в парке
 * профилей, а «вставлено» и «обновлено» считали бы один и тот же новый профиль дважды:
 * в проходе `asc` он вставляется, в `desc` уже обновляется.
 */
export type RunProfiles = {
  /** Всё, что показал API, включая неразобравшиеся: с этим сверяется `total` куска. */
  seen: Set<string>;
  /** Доехавшие до базы. */
  written: Set<string>;
  /** Из них появившиеся в реестре впервые. */
  inserted: Set<string>;
};

const emptyRunProfiles = (): RunProfiles => ({
  seen: new Set<string>(),
  written: new Set<string>(),
  inserted: new Set<string>(),
});

/** Всё, что прогон накопил о себе к этому моменту. Общее у планового обхода и точечного. */
export type RegistryWriteState = {
  counters: Counters;
  profiles: RunProfiles;
  /** Незнакомые значения чужих словарей — по разу на прогон, а не на страницу. */
  unknownValues: Set<string>;
  malformedIds: MalformedProfile[];
};

export const createRegistryWriteState = (): RegistryWriteState => ({
  counters: emptyCounters(),
  profiles: emptyRunProfiles(),
  unknownValues: new Set<string>(),
  malformedIds: [],
});

const toParkProfileInput = (profile: RegistryProfile, personId: string): ParkProfileInput => ({
  profileId: profile.profileId,
  personId,
  parkId: profile.parkId,
  firstName: profile.firstName,
  lastName: profile.lastName,
  middleName: profile.middleName,
  workStatus: profile.workStatus,
  employmentType: profile.employmentType,
  isSelfemployed: profile.isSelfemployed,
  workRuleId: profile.workRuleId,
  hireDate: profile.hireDate,
  fireDate: profile.fireDate,
  currentStatus: profile.currentStatus,
  currentStatusUpdatedAt: profile.currentStatusUpdatedAt,
  callsign: profile.callsign,
  carId: profile.carId,
  carNumber: profile.carNumber,
  carBrandModel: profile.carBrandModel,
  apiCreatedAt: profile.apiCreatedAt,
  apiModifiedAt: profile.apiModifiedAt,
  apiUpdatedAt: profile.apiUpdatedAt,
});

const toLicenseInput = (profile: RegistryProfile, numberCanonical: string): PersonLicenseInput => ({
  numberCanonical,
  numberRaw: profile.license.numberRaw,
  country: profile.license.country,
  issueDate: profile.license.issueDate,
  expirationDate: profile.license.expirationDate,
});

/** Профиль вместе с каноническим номером его удостоверения. */
type Candidate = {
  profile: RegistryProfile;
  numberCanonical: string;
};

/**
 * Незнакомое значение чужого словаря приходит от адаптера строкой `словарь=значение`.
 * Ссылкой становится строка целиком: одно и то же значение приходит из разных словарей
 * и по уникальности `(reason, reference)` схлопнулось бы в одну строку.
 */
const toUnknownValueSkip = (unknownValue: string): SyncSkipInput => {
  const separator = unknownValue.indexOf('=');

  return {
    reason: 'unknown_value',
    reference: unknownValue,
    detail: separator < 0 ? null : unknownValue.slice(0, separator),
  };
};

/**
 * Заводит людей под новые профили — через канонический номер удостоверения.
 *
 * Профили одного номера собираются в группу до записи: 672 номера принадлежат 1 380
 * профилям, и без группировки уникальный индекс `person_licenses_active_number_key`
 * отбил бы вторую активную строку и уронил прогон посередине.
 */
const ensureOwners = async (
  fresh: readonly Candidate[],
  counters: Counters,
): Promise<Map<string, string>> => {
  if (fresh.length === 0) {
    return new Map();
  }

  const licenses = new Map<string, PersonLicenseInput>();

  // Внутри группы строка удостоверения берётся у профиля с наименьшим идентификатором,
  // а не у первого встреченного: порядок страниц не гарантирован, и повторный прогон
  // обязан выбрать тот же профиль.
  for (const candidate of [...fresh].sort((left, right) =>
    left.profile.profileId.localeCompare(right.profile.profileId),
  )) {
    if (!licenses.has(candidate.numberCanonical)) {
      licenses.set(
        candidate.numberCanonical,
        toLicenseInput(candidate.profile, candidate.numberCanonical),
      );
    }
  }

  const ensured = await ensurePersonsForNewProfiles([...licenses.values()], LICENSE_SOURCE);
  counters.personsCreated += ensured.created;

  return ensured.personIds;
};

/** Кто из перечисленных профилей потерял номера, а кто получил новые. */
const buildPhoneChanges = (
  candidates: readonly Candidate[],
  active: readonly ProfilePhoneRow[],
): { open: ProfilePhoneInput[]; close: ProfilePhoneRow[] } => {
  const activeByProfile = new Map<string, Set<string>>();

  for (const row of active) {
    const phones = activeByProfile.get(row.profileId) ?? new Set<string>();
    phones.add(row.phoneRaw);
    activeByProfile.set(row.profileId, phones);
  }

  const open: ProfilePhoneInput[] = [];
  const close: ProfilePhoneRow[] = [];

  for (const { profile } of candidates) {
    const incoming = new Set(profile.phones);
    const stored = activeByProfile.get(profile.profileId) ?? new Set<string>();

    for (const phoneRaw of incoming) {
      if (!stored.has(phoneRaw)) {
        open.push({
          profileId: profile.profileId,
          phoneRaw,
          // Той же функцией, какой читает номер регистрация в боте: по этому полю идёт
          // автопривязка, и две нормализации разошлись бы на первом же номере, записанном
          // парком с пробелами (server/utils/phoneNumber.ts).
          phoneE164: normalizePhoneE164(phoneRaw),
        });
      }
    }

    for (const phoneRaw of stored) {
      if (!incoming.has(phoneRaw)) {
        close.push({ profileId: profile.profileId, phoneRaw });
      }
    }
  }

  return { open, close };
};

/**
 * Обновляет удостоверения тех, у кого номер разошёлся с записанным.
 *
 * Номер перевыпускается: у 171 пары из проверенных он разошёлся между старой базой
 * и реестром. Смена — это закрытие активной строки и новая рядом, а не правка на месте.
 *
 * Случай, когда пришедший номер уже активен у **другого** человека, не обрабатывается
 * молча и не роняет прогон: это заявка на объединение двух людей, а объединение — это
 * перенос баллов, и делать его синхронизацией нельзя (docs/drivers.md → «Склейка
 * двойников»). Такой профиль ложится строкой `license_conflict` в журнал пропущенного.
 */
const syncLicenses = async (
  candidates: readonly Candidate[],
  states: Map<string, { personId: string }>,
  now: Date,
  counters: Counters,
  skips: SyncSkipInput[],
): Promise<void> => {
  // По человеку — один кандидат: у человека бывает несколько профилей, и два из них
  // в одной странице тянули бы удостоверение каждый на себя.
  const byPerson = new Map<string, Candidate>();

  for (const candidate of [...candidates].sort((left, right) =>
    left.profile.profileId.localeCompare(right.profile.profileId),
  )) {
    const personId = states.get(candidate.profile.profileId)?.personId;

    if (personId && !byPerson.has(personId)) {
      byPerson.set(personId, candidate);
    }
  }

  const stored = await readActiveLicenses([...byPerson.keys()]);
  const changed = [...byPerson.entries()].filter(
    ([personId, candidate]) => stored.get(personId) !== candidate.numberCanonical,
  );

  if (changed.length === 0) {
    return;
  }

  const holders = await readPersonIdsByLicenseNumbers(
    changed.map(([, candidate]) => candidate.numberCanonical),
  );

  for (const [personId, candidate] of changed) {
    const holder = holders.get(candidate.numberCanonical);

    if (holder && holder !== personId) {
      counters.licenseConflicts += 1;
      skips.push({
        reason: 'license_conflict',
        reference: candidate.profile.profileId,
        detail: candidate.numberCanonical,
      });
      continue;
    }

    await replacePersonLicense(
      personId,
      toLicenseInput(candidate.profile, candidate.numberCanonical),
      LICENSE_SOURCE,
      now,
    );
    counters.licensesUpdated += 1;
  }
};

/**
 * Кладёт разобранные профили и всё, что за ними тянется.
 *
 * Порядок здесь не декоративный: прежние статусы читаются **до** записи профилей —
 * иначе сравнивать переход будет не с чем; люди заводятся **до** профилей — на них
 * стоит внешний ключ; телефоны и события пишутся **после** — тот же ключ.
 */
const writeProfiles = async (
  profiles: readonly RegistryProfile[],
  runId: string,
  now: Date,
  counters: Counters,
  written: RunProfiles,
): Promise<SyncSkipInput[]> => {
  const skips: SyncSkipInput[] = [];

  // Проходы с двух концов перекрываются намеренно, и один профиль приходит дважды.
  // Побеждает последнее вхождение — оно свежее.
  const unique = new Map<string, RegistryProfile>(
    profiles.map((profile) => [profile.profileId, profile]),
  );

  const candidates: Candidate[] = [];

  for (const profile of unique.values()) {
    const numberCanonical = normalizeLicenseNumber(profile.license.numberRaw).trim();

    // Профиль без номера удостоверения не заводится: человек опознаётся номером,
    // и завести его без номера значит завести личность, которую никогда не найти
    // повторным прогоном (docs/drivers.md). Прогон при этом продолжается.
    if (numberCanonical === '') {
      counters.skippedWithoutLicense += 1;
      skips.push({
        reason: 'malformed',
        reference: profile.profileId,
        detail: 'driver_license.number',
      });
      continue;
    }

    candidates.push({ profile, numberCanonical });
  }

  if (candidates.length === 0) {
    return skips;
  }

  const states = await readProfileStates(candidates.map((candidate) => candidate.profile.profileId));
  const fresh = candidates.filter((candidate) => !states.has(candidate.profile.profileId));
  const ownersByLicense = await ensureOwners(fresh, counters);

  const rows: ParkProfileInput[] = [];

  for (const candidate of candidates) {
    // Человек существующего профиля не переназначается: смена номера удостоверения
    // закрывает строку журнала, а не переносит учётку другому человеку.
    const personId =
      states.get(candidate.profile.profileId)?.personId ??
      ownersByLicense.get(candidate.numberCanonical);

    if (!personId) {
      throw new Error(
        `человек по номеру ${candidate.numberCanonical} не завёлся — прогон остановлен`,
      );
    }

    rows.push(toParkProfileInput(candidate.profile, personId));
  }

  const upserted = await upsertParkProfiles(rows, now);

  // Множествами, а не счётчиком: тот же профиль приедет встречным проходом, и второй
  // раз он не «ещё один обновлённый», а тот же самый. Новым он при этом остаётся новым —
  // «вставлено» считает первое появление в реестре, а не первую встречу в этом прогоне.
  for (const [profileId, inserted] of upserted) {
    written.written.add(profileId);

    if (inserted) {
      written.inserted.add(profileId);
    }
  }

  const statusChanges: ProfileStatusChange[] = [];

  for (const candidate of candidates) {
    const previous = states.get(candidate.profile.profileId)?.workStatus ?? null;

    // У нового профиля пишется первая запись журнала: откуда он пришёл, парк не говорит.
    // У существующего — только настоящий переход; иначе повторный прогон того же окна
    // плодил бы строки на ровном месте.
    if (previous !== candidate.profile.workStatus) {
      statusChanges.push({
        profileId: candidate.profile.profileId,
        statusFrom: previous,
        statusTo: candidate.profile.workStatus,
      });
    }
  }

  counters.statusEvents += await insertProfileStatusEvents(statusChanges, runId);

  const phones = buildPhoneChanges(
    candidates,
    await readActiveProfilePhones(candidates.map((candidate) => candidate.profile.profileId)),
  );

  counters.phonesOpened += await insertActiveProfilePhones(phones.open);
  counters.phonesClosed += await closeProfilePhones(phones.close, now);

  await syncLicenses(candidates, states, now, counters, skips);

  // Заказы, лежавшие в журнале пропущенного из-за неизвестного водителя, разрешаются
  // ровно здесь: их профиль появился в реестре. Список нерешённого обязан таять.
  counters.resolvedSkips += await resolveSkipsForProfiles([...upserted.keys()]);

  return skips;
};

/**
 * Что делать с каждой пришедшей страницей. Одинаково у планового обхода и у точечного
 * прогона: единственная разница между ними — как страница добыта.
 *
 * `seen` — множество куска: полный обход сверяет по нему, что кусок взят целиком.
 * У остальных его нет.
 */
export const applyProfilesPage = async (
  state: RegistryWriteState,
  page: ProfilesPage,
  runId: string,
  now: Date,
  seen?: Set<string>,
): Promise<void> => {
  const { counters, profiles, unknownValues, malformedIds } = state;

  counters.pages += 1;
  counters.responseRows += page.received;
  counters.malformed += page.malformed;

  // Различные профили — по тому, что API показал, а не по тому, что мы сумели разобрать:
  // неразобранный профиль реестром получен, и кусок обязан сойтись вместе с ним.
  // Сюда же смотрит сверка куска с его `total`, поэтому множество одно на оба вопроса.
  for (const profile of page.profiles) {
    profiles.seen.add(profile.profileId);
    seen?.add(profile.profileId);
  }

  for (const malformed of page.malformedIds) {
    profiles.seen.add(malformed.profileId);
    seen?.add(malformed.profileId);
  }

  if (malformedIds.length < SAMPLE_LIMIT) {
    malformedIds.push(...page.malformedIds.slice(0, SAMPLE_LIMIT - malformedIds.length));
  }

  const pageSkips: SyncSkipInput[] = page.malformedIds.map((malformed) => ({
    reason: 'malformed',
    reference: malformed.profileId,
    detail: malformed.field,
  }));

  // Незнакомое значение словаря пишется раз на прогон, а не раз на страницу: иначе
  // `times_seen` считал бы страницы, а читается он как «столько прогонов принесли это».
  for (const value of page.unknownValues) {
    if (unknownValues.has(value)) {
      continue;
    }

    unknownValues.add(value);
    pageSkips.push(toUnknownValueSkip(value));
  }

  pageSkips.push(...(await writeProfiles(page.profiles, runId, now, counters, profiles)));

  // Пропущенное кладётся постранично: у прогона, упавшего на середине, то, что он успел
  // увидеть, остаётся в базе.
  await recordSyncSkips(runId, pageSkips);
};

/**
 * Снимок прогона на этот момент — числами, годными для свода за период.
 *
 * Профили считаются размерами множеств: «увидено» и «подтверждено» обязаны означать
 * одно и то же у всех видов прогона, иначе сумма за неделю складывает несравнимое.
 * Цена нарезки живёт отдельным числом — она полезна, но это другой вопрос.
 */
export const toRunDetails = (state: RegistryWriteState): SyncRunRegistryCounters => ({
  ...state.counters,
  profilesSeen: state.profiles.seen.size,
  profilesInserted: state.profiles.inserted.size,
  profilesUpdated: state.profiles.written.size - state.profiles.inserted.size,
});

/** Жалуется в лог на то, о чём обязан знать человек, каким бы прогоном это ни пришло. */
export const warnAboutFindings = (kind: string, state: RegistryWriteState): void => {
  if (state.unknownValues.size > 0) {
    log.warn('Fleet API прислал незнакомые значения словарей — записаны текстом', {
      kind,
      unknownValues: [...state.unknownValues],
    });
  }

  if (state.counters.licenseConflicts > 0) {
    log.warn(
      'Номер удостоверения пришёл на профиль, но уже активен у другого человека — журнал не тронут, строки в sync_skips',
      { kind, licenseConflicts: state.counters.licenseConflicts },
    );
  }
};
