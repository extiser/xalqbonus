import { consola } from 'consola';

import { createFleetClient, type FleetTransport } from '#server/adapters/fleet/client';
import {
  probeProfilesTotal,
  PROFILES_PAGE_SIZE,
  readProfilesPage,
  readUpdatedAtEdge,
  readWorkRules,
  type ProfileFilter,
  type ProfileSortField,
  type ProfilesPage,
  type ProfilesWindow,
} from '#server/adapters/fleet/profiles';
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
import {
  saveSyncRunRegistry,
  type SyncRunRegistryCounters,
} from '#server/repositories/syncRunRegistry';
import { finishSyncRun, startSyncRun } from '#server/repositories/syncRuns';
import {
  recordSyncSkips,
  resolveSkipsForProfiles,
  type SyncSkipInput,
} from '#server/repositories/syncSkips';
import { readSyncState, setSyncWatermark } from '#server/repositories/syncState';
import { buildRegistryWindow } from '#server/services/sync/buildRegistryWindow';
import {
  readSyncConfig,
  staleWatermarkThresholdMs,
  type RegistrySyncKind,
  type SyncConfig,
} from '#server/services/sync/config';
import {
  fitsByDepth,
  MIN_WINDOW_SECONDS,
  passesFor,
  STAGE_REASON,
  windowAccepts,
  type ChunkPass,
  type ChunkStage,
} from '#server/services/sync/registryChunks';
import { normalizeLicenseNumber } from '#server/utils/licenseNumber';

/**
 * Прогон синхронизации профилей парка.
 *
 * Два режима, один код записи:
 *
 *   - **`registry`** — инкрементальный, по расписанию. Берёт изменившихся окном
 *     по `updated_at`. Это рабочий режим и единицы запросов в сутки;
 *   - **`registry_full`** — полный обход нарезкой, по требованию: первое наполнение,
 *     подозрение на расхождение, аудит. По расписанию не ходит никогда.
 *
 * Что здесь принципиально:
 *
 *   - **отметка двигается только после успешного прогона**, и у инкрементального —
 *     по верхней границе окна, которое реально взято, а не которое хотелось взять;
 *   - **полный обход двигает отметку по времени начала обхода**: обход идёт около
 *     получаса, и профиль, изменившийся во время него, иначе провалился бы в щель;
 *   - **кусок считается взятым, только когда число различных `id` сошлось с его `total`**.
 *     Не сошёлся — дробится окнами, не помогло — прогон падает явной ошибкой. Молча
 *     неполный обход хуже отсутствующего: на его основании закроют вопрос «всех ли
 *     мы видим» (docs/decisions.md → «Реестр парка выгружается нарезкой»);
 *   - **ничего не удаляется.** Профиль, пропавший из ответов API, остаётся как есть:
 *     признака удаления этот API не отдаёт, и догадываться о нём по отсутствию
 *     в выборке нельзя;
 *   - **участие в программе здесь не заводится и не трогается**: реестр — это все, кого
 *     знает парк, а участие начинается привязкой Telegram (docs/drivers.md).
 */

const log = consola.withTag('sync:registry');

/** Источник строки журнала удостоверений: реестр парка, а не старая база. */
const LICENSE_SOURCE = 'fleet_api';

/** Форма, по которой заполняется нормализованный телефон. 446 номеров реестра ей не отвечают. */
const E164_UZBEKISTAN = /^\+998\d{9}$/;

/** Статусы, каждый из которых берётся своим куском. `working` режется по условиям работы. */
const STATUS_CHUNKS = ['fired', 'not_working'] as const;

const WORKING_STATUS = 'working';

/**
 * Сколько идентификаторов пропущенного показывать в сводке.
 *
 * Ограничение лога и только лога: в `xb.sync_skips` едет всё до единого, поимённо
 * и без обрезки — то, что за пятидесятым, иначе не было бы названо нигде и никогда.
 */
const SAMPLE_LIMIT = 50;

export type RegistrySyncStatus = 'succeeded' | 'failed' | 'skipped';

export type RegistrySyncSummary = {
  kind: RegistrySyncKind;
  status: RegistrySyncStatus;
  /** Пусто, если прогон не заводился: окно оказалось пустым. */
  runId: string | null;
  /** Окно, которое реально взято. У полного обхода окна нет вовсе. */
  window: ProfilesWindow | null;
  /** Отметка, на которую встал прогон. Пусто у неуспешного и незаводившегося. */
  watermark: Date | null;
  requests: number;
  rateLimited: number;
  pages: number;
  profilesSeen: number;
  profilesInserted: number;
  profilesUpdated: number;
  personsCreated: number;
  statusEvents: number;
  phonesOpened: number;
  phonesClosed: number;
  licensesUpdated: number;
  licenseConflicts: number;
  skippedWithoutLicense: number;
  malformed: number;
  malformedIds: MalformedProfile[];
  resolvedSkips: number;
  unknownValues: string[];
  chunksTotal: number;
  chunksWindowed: number;
  maxOffsetDepth: number;
};

/**
 * Кусок не сошёлся с собственным `total` даже после дробления окнами.
 *
 * Отдельным типом, а не общей ошибкой: это не поломка кода и не отказ сети, а ровно тот
 * случай, ради которого сверка счётчика и делается, — обход неполон, и знать об этом надо
 * до того, как на него сошлются.
 */
export class RegistryChunkShortError extends Error {
  constructor(
    public readonly chunk: string,
    public readonly collected: number,
    public readonly expected: number,
  ) {
    super(`кусок «${chunk}»: собрано ${collected} из ${expected}, окна положение не исправили`);
    this.name = 'RegistryChunkShortError';
  }
}

/** Кусок обхода: непересекающаяся часть реестра со своим фильтром и своим размером. */
type RegistryChunk = {
  key: string;
  title: string;
  filter: ProfileFilter;
  total: number;
};

type Counters = {
  pages: number;
  profilesSeen: number;
  profilesInserted: number;
  profilesUpdated: number;
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
  profilesSeen: 0,
  profilesInserted: 0,
  profilesUpdated: 0,
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
          phoneE164: E164_UZBEKISTAN.test(phoneRaw) ? phoneRaw : null,
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

  const written = await upsertParkProfiles(rows, now);

  for (const inserted of written.values()) {
    if (inserted) {
      counters.profilesInserted += 1;
    } else {
      counters.profilesUpdated += 1;
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
  counters.resolvedSkips += await resolveSkipsForProfiles([...written.keys()]);

  return skips;
};

export type RunRegistrySyncOptions = {
  /** Подставляется тестами и разовым запуском. По умолчанию — настоящий клиент Fleet API. */
  client?: FleetTransport;
  now?: Date;
};

export const runRegistrySync = async (
  kind: RegistrySyncKind,
  options: RunRegistrySyncOptions = {},
): Promise<RegistrySyncSummary> => {
  const config = readSyncConfig();
  const now = options.now ?? new Date();
  const state = await readSyncState('registry');
  const requestedWindow =
    kind === 'registry'
      ? buildRegistryWindow({ watermark: state?.watermark ?? null, now, config })
      : null;

  if (kind === 'registry' && !requestedWindow) {
    log.info('Окно пусто, прогон не заводится', { kind, watermark: state?.watermark ?? null });

    return emptySummary(kind);
  }

  if (kind === 'registry' && !state?.watermark) {
    log.warn(
      'Отметка синхронизации реестра пуста — прогон берёт только окно перекрытия. Весь реестр закроет полный обход',
      { kind },
    );
  }

  warnIfWatermarkStale(state?.watermark ?? null, now, config);

  // Клиент собирается до строки прогона: незаполненные реквизиты в окружении — это отказ
  // на старте, а не прогон, навсегда оставшийся в состоянии `running`.
  const client =
    options.client ??
    createFleetClient({
      onRateLimited: (description, attempt, waitMs) => {
        log.warn('Отказ по лимиту Fleet API', { kind, description, attempt, waitMs });
      },
    });

  const runId = await startSyncRun(kind, requestedWindow?.updatedFrom ?? null, now);

  const counters = emptyCounters();
  const unknownValues = new Set<string>();
  const malformedIds: MalformedProfile[] = [];
  // Окно есть только у инкрементального прогона: пустое окно у него отсеяно выше,
  // а у полного обхода его не бывает вовсе.
  let takenWindow: ProfilesWindow | null = requestedWindow;

  /** Что делать с каждой пришедшей страницей. Одинаково в обоих режимах. */
  const handlePage = async (page: ProfilesPage, seen?: Set<string>): Promise<void> => {
    counters.pages += 1;
    counters.profilesSeen += page.received;
    counters.malformed += page.malformed;

    if (seen) {
      // Сверка идёт по тому, что API показал, а не по тому, что мы сумели разобрать:
      // неразобранный профиль реестром получен, и кусок обязан сойтись вместе с ним.
      for (const profile of page.profiles) {
        seen.add(profile.profileId);
      }

      for (const malformed of page.malformedIds) {
        seen.add(malformed.profileId);
      }
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

    pageSkips.push(...(await writeProfiles(page.profiles, runId, now, counters)));

    // Пропущенное кладётся постранично: у прогона, упавшего на середине, то, что он успел
    // увидеть, остаётся в базе.
    await recordSyncSkips(runId, pageSkips);
  };

  try {
    if (requestedWindow) {
      takenWindow = await crawlIncremental(client, requestedWindow, counters, handlePage);
    } else {
      await crawlFull(client, counters, handlePage);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stats = client.stats();

    await finishSyncRun(
      runId,
      'failed',
      {
        requests: stats.requests,
        rateLimited: stats.rateLimited,
        itemsSeen: counters.profilesSeen,
        itemsWritten: counters.profilesInserted + counters.profilesUpdated,
      },
      message,
    );

    // Детали пишутся и у упавшего прогона — у него они и важнее всего. Но после закрытия
    // строки и под своим `try`: прогон падает чаще всего именно потому, что база
    // недоступна, и без перехвата эта запись заменила бы собой настоящую ошибку.
    try {
      await saveSyncRunRegistry(runId, toRunDetails(counters));
    } catch (detailsError) {
      log.error('Детали упавшего прогона записать не удалось — осталась только строка прогона', {
        kind,
        runId,
        error: detailsError instanceof Error ? detailsError.message : String(detailsError),
      });
    }

    // Отметка не трогается намеренно: окно будет перечитано целиком следующим прогоном.
    log.error('Прогон синхронизации профилей упал, отметка осталась на месте', {
      kind,
      runId,
      pages: counters.pages,
      profilesSeen: counters.profilesSeen,
      requests: stats.requests,
      rateLimited: stats.rateLimited,
      error: message,
    });

    throw error;
  }

  const stats = client.stats();

  // До закрытия строки: успешным прогон объявляется тогда, когда его детали уже в базе.
  await saveSyncRunRegistry(runId, toRunDetails(counters));

  await finishSyncRun(
    runId,
    'succeeded',
    {
      requests: stats.requests,
      rateLimited: stats.rateLimited,
      itemsSeen: counters.profilesSeen,
      itemsWritten: counters.profilesInserted + counters.profilesUpdated,
    },
    null,
  );

  // Инкрементальный прогон встаёт на верхнюю границу окна, которое **взято**: если окно
  // пришлось ужать по глубине, остаток догонит следующий прогон. Полный обход встаёт
  // на время своего начала с запасом назад — он идёт около получаса, и изменившееся
  // во время него иначе провалилось бы в щель.
  const watermark = takenWindow
    ? takenWindow.updatedTo
    : new Date(now.getTime() - config.registryOverlapMinutes * 60_000);

  await setSyncWatermark('registry', watermark, runId);

  const summary: RegistrySyncSummary = {
    kind,
    status: 'succeeded',
    runId,
    window: takenWindow,
    watermark,
    requests: stats.requests,
    rateLimited: stats.rateLimited,
    pages: counters.pages,
    profilesSeen: counters.profilesSeen,
    profilesInserted: counters.profilesInserted,
    profilesUpdated: counters.profilesUpdated,
    personsCreated: counters.personsCreated,
    statusEvents: counters.statusEvents,
    phonesOpened: counters.phonesOpened,
    phonesClosed: counters.phonesClosed,
    licensesUpdated: counters.licensesUpdated,
    licenseConflicts: counters.licenseConflicts,
    skippedWithoutLicense: counters.skippedWithoutLicense,
    malformed: counters.malformed,
    malformedIds,
    resolvedSkips: counters.resolvedSkips,
    unknownValues: [...unknownValues],
    chunksTotal: counters.chunksTotal,
    chunksWindowed: counters.chunksWindowed,
    maxOffsetDepth: counters.maxOffsetDepth,
  };

  // Сводка одной строкой. Имён, телефонов и номеров удостоверений в логе нет:
  // идентификатор профиля персональными данными не является, остальное — является.
  log.info('Прогон синхронизации профилей завершён', {
    kind,
    runId,
    updatedFrom: takenWindow?.updatedFrom.toISOString() ?? null,
    updatedTo: takenWindow?.updatedTo.toISOString() ?? null,
    watermark: watermark.toISOString(),
    pages: counters.pages,
    requests: stats.requests,
    rateLimited: stats.rateLimited,
    profilesSeen: counters.profilesSeen,
    profilesInserted: counters.profilesInserted,
    profilesUpdated: counters.profilesUpdated,
    personsCreated: counters.personsCreated,
    statusEvents: counters.statusEvents,
    phonesOpened: counters.phonesOpened,
    phonesClosed: counters.phonesClosed,
    licensesUpdated: counters.licensesUpdated,
    licenseConflicts: counters.licenseConflicts,
    skippedWithoutLicense: counters.skippedWithoutLicense,
    malformed: counters.malformed,
    malformedIds,
    malformedIdsHidden: counters.malformed - malformedIds.length,
    resolvedSkips: counters.resolvedSkips,
    chunksTotal: counters.chunksTotal,
    chunksWindowed: counters.chunksWindowed,
    maxOffsetDepth: counters.maxOffsetDepth,
    unknownValues: summary.unknownValues,
  });

  if (summary.unknownValues.length > 0) {
    log.warn('Fleet API прислал незнакомые значения словарей — записаны текстом', {
      kind,
      unknownValues: summary.unknownValues,
    });
  }

  if (counters.licenseConflicts > 0) {
    log.warn(
      'Номер удостоверения пришёл на профиль, но уже активен у другого человека — журнал не тронут, строки в sync_skips',
      { kind, licenseConflicts: counters.licenseConflicts },
    );
  }

  return summary;
};

const emptySummary = (kind: RegistrySyncKind): RegistrySyncSummary => ({
  kind,
  status: 'skipped',
  runId: null,
  window: null,
  watermark: null,
  requests: 0,
  rateLimited: 0,
  pages: 0,
  profilesSeen: 0,
  profilesInserted: 0,
  profilesUpdated: 0,
  personsCreated: 0,
  statusEvents: 0,
  phonesOpened: 0,
  phonesClosed: 0,
  licensesUpdated: 0,
  licenseConflicts: 0,
  skippedWithoutLicense: 0,
  malformed: 0,
  malformedIds: [],
  resolvedSkips: 0,
  unknownValues: [],
  chunksTotal: 0,
  chunksWindowed: 0,
  maxOffsetDepth: 0,
});

const toRunDetails = (counters: Counters): SyncRunRegistryCounters => ({ ...counters });

/**
 * Жалуется в лог, если отметка застряла.
 *
 * Та же беда, что у заказов, и заметить её можно тем же способом: по расстоянию между
 * отметкой и текущим моментом. Если падать начнёт каждый прогон, строки в `sync_runs`
 * будут появляться, воркер будет жив, а реестр — стоять.
 */
const warnIfWatermarkStale = (watermark: Date | null, now: Date, config: SyncConfig): void => {
  if (!watermark) {
    return;
  }

  const lagMs = now.getTime() - watermark.getTime();
  const thresholdMs = staleWatermarkThresholdMs('registry', config);

  if (lagMs <= thresholdMs) {
    return;
  }

  log.warn('Отметка синхронизации реестра отстала — окно не движется, а прогоны идут', {
    watermark: watermark.toISOString(),
    lagMinutes: Math.round(lagMs / 60_000),
    thresholdMinutes: Math.round(thresholdMs / 60_000),
  });
};

type PageHandler = (page: ProfilesPage, seen?: Set<string>) => Promise<void>;

/**
 * Один проход по выборке в одну сторону сортировки.
 *
 * Страницы берутся целиком: хвост, вылезающий за половину, перекрывается со встречным
 * проходом и снимается по `id` — перекрытие дешевле, чем дыра на стыке половин.
 */
const walkPass = async (
  client: FleetTransport,
  request: {
    filter: ProfileFilter | null;
    window: ProfilesWindow | null;
    sortField: ProfileSortField;
  },
  pass: ChunkPass,
  title: string,
  counters: Counters,
  onPage: PageHandler,
  seen?: Set<string>,
): Promise<void> => {
  let offset = 0;

  while (offset < pass.target) {
    const page = await readProfilesPage(
      client,
      {
        filter: request.filter,
        window: request.window,
        sortField: request.sortField,
        direction: pass.direction,
        offset,
        limit: PROFILES_PAGE_SIZE,
      },
      `${title}, ${pass.direction} offset ${offset}`,
    );

    if (page.received === 0) {
      return;
    }

    counters.maxOffsetDepth = Math.max(counters.maxOffsetDepth, offset);
    offset += page.received;

    await onPage(page, seen);

    if (page.received < PROFILES_PAGE_SIZE) {
      return;
    }
  }
};

/**
 * Инкрементальный обход: одно окно по `updated_at` на весь парк, без нарезки.
 *
 * Окно ужимается, если изменившихся в нём оказалось больше, чем берётся разрешённой
 * глубиной offset. Ужимается по промеру, а не по догадке, и отметка потом встаёт
 * на взятую границу — остаток догонит следующий прогон, тем же способом, каким
 * у заказов работает потолок ширины окна.
 */
const crawlIncremental = async (
  client: FleetTransport,
  window: ProfilesWindow,
  counters: Counters,
  onPage: PageHandler,
): Promise<ProfilesWindow> => {
  let taken = window;
  let total = await probeProfilesTotal(client, null, taken, 'реестр, изменившиеся: размер окна');

  while (total > 0 && !fitsByDepth(total)) {
    const spanSeconds = (taken.updatedTo.getTime() - taken.updatedFrom.getTime()) / 1_000;

    if (spanSeconds <= MIN_WINDOW_SECONDS) {
      // Минута, за которую изменилось столько профилей, — это не окно, а массовая правка
      // в парке. Дробить дальше нечего: берём как есть и рассказываем об этом.
      log.warn('Окно ужато до предела, а профилей всё равно много — обход пойдёт вглубь', {
        total,
        spanSeconds,
      });
      break;
    }

    taken = {
      updatedFrom: taken.updatedFrom,
      updatedTo: new Date(taken.updatedFrom.getTime() + (spanSeconds / 2) * 1_000),
    };

    total = await probeProfilesTotal(client, null, taken, 'реестр, изменившиеся: размер окна');

    log.info('Окно ужато по глубине offset — остаток догонит следующий прогон', {
      updatedTo: taken.updatedTo.toISOString(),
      total,
    });
  }

  if (total === 0) {
    return taken;
  }

  for (const pass of passesFor(total)) {
    await walkPass(
      client,
      { filter: null, window: taken, sortField: 'updated_at' },
      pass,
      'реестр, изменившиеся',
      counters,
      onPage,
    );
  }

  return taken;
};

/**
 * План нарезки: `fired` и `not_working` — каждый своим куском, `working` — по куску
 * на условие работы. Профиль попадает ровно в один кусок по паре
 * `(work_status, work_rule_id)`.
 */
const buildChunkPlan = async (
  client: FleetTransport,
): Promise<{ registryTotal: number; chunks: RegistryChunk[] }> => {
  const registryTotal = await probeProfilesTotal(client, null, null, 'весь реестр, размер');
  const chunks: RegistryChunk[] = [];

  for (const status of STATUS_CHUNKS) {
    chunks.push({
      key: status,
      title: status,
      filter: { workStatus: [status] },
      total: await probeProfilesTotal(client, { workStatus: [status] }, null, `кусок ${status}, размер`),
    });
  }

  const workingFilter: ProfileFilter = { workStatus: [WORKING_STATUS] };
  const workingTotal = await probeProfilesTotal(client, workingFilter, null, 'кусок working, размер');
  const rules = await readWorkRules(client);
  const ruleChunks: RegistryChunk[] = [];

  for (const rule of rules) {
    const filter: ProfileFilter = { workStatus: [WORKING_STATUS], workRuleId: [rule.id] };

    ruleChunks.push({
      key: `working:${rule.id}`,
      title: `working / ${rule.name}`,
      filter,
      total: await probeProfilesTotal(
        client,
        filter,
        null,
        `кусок working/${rule.id.slice(0, 8)}…, размер`,
      ),
    });
  }

  const byRules = ruleChunks.reduce((sum, chunk) => sum + chunk.total, 0);

  if (byRules === workingTotal) {
    chunks.push(...ruleChunks);
  } else {
    // Условия работы не покрывают статус целиком: у части профилей `work_rule_id`
    // не из справочника или пуст. Такой остаток фильтром не выразить, поэтому `working`
    // берётся одним куском — он не влезет по глубине и уйдёт в дробление окнами.
    log.warn('Сумма по условиям работы не сходится с working — беру статус одним куском', {
      byRules,
      workingTotal,
      difference: byRules - workingTotal,
    });

    chunks.push({
      key: WORKING_STATUS,
      title: 'working (целиком)',
      filter: workingFilter,
      total: workingTotal,
    });
  }

  const planned = chunks.reduce((sum, chunk) => sum + chunk.total, 0);

  log.info('План обхода реестра построен', {
    registryTotal,
    chunks: chunks.length,
    nonEmpty: chunks.filter((chunk) => chunk.total > 0).length,
    planned,
    workRules: rules.length,
  });

  if (planned !== registryTotal) {
    log.warn('Сумма кусков не сходится с размером реестра', {
      planned,
      registryTotal,
      difference: planned - registryTotal,
    });
  }

  return { registryTotal, chunks };
};

/**
 * Дробление куска окнами по `updated_at`, пока каждое окно не станет приниматься правилом
 * ступени. Соседние окна перекрываются на секунду: полуинтервал в документации
 * не оговорён, а лишний повтор снимается по `id` — потерянная запись не восстанавливается
 * ничем.
 */
const splitWindow = async (
  client: FleetTransport,
  chunk: RegistryChunk,
  since: Date,
  until: Date,
  accept: (total: number) => boolean,
  windows: { window: ProfilesWindow; total: number }[],
): Promise<void> => {
  const window: ProfilesWindow = { updatedFrom: since, updatedTo: until };
  const total = await probeProfilesTotal(
    client,
    chunk.filter,
    window,
    `${chunk.title}: окно ${since.toISOString()}…${until.toISOString()}, размер`,
  );

  if (total === 0) {
    return;
  }

  if (accept(total)) {
    windows.push({ window, total });
    return;
  }

  const spanSeconds = (until.getTime() - since.getTime()) / 1_000;

  if (spanSeconds <= MIN_WINDOW_SECONDS) {
    throw new RegistryChunkShortError(chunk.title, 0, total);
  }

  const middle = new Date(since.getTime() + (spanSeconds / 2) * 1_000);

  await splitWindow(client, chunk, since, middle, accept, windows);
  await splitWindow(client, chunk, new Date(middle.getTime() - 1_000), until, accept, windows);
};

const buildWindows = async (
  client: FleetTransport,
  chunk: RegistryChunk,
  stage: ChunkStage,
): Promise<{ window: ProfilesWindow; total: number }[]> => {
  const since = await readUpdatedAtEdge(
    client,
    chunk.filter,
    null,
    'asc',
    `${chunk.title}: край updated_at asc`,
  );
  const until = await readUpdatedAtEdge(
    client,
    chunk.filter,
    null,
    'desc',
    `${chunk.title}: край updated_at desc`,
  );

  if (!since || !until) {
    throw new RegistryChunkShortError(chunk.title, 0, chunk.total);
  }

  const windows: { window: ProfilesWindow; total: number }[] = [];

  await splitWindow(
    client,
    chunk,
    since,
    new Date(until.getTime() + 1_000),
    windowAccepts(stage),
    windows,
  );

  log.info('Кусок разбит окнами по updated_at', { chunk: chunk.title, windows: windows.length });

  return windows;
};

/**
 * Берёт один кусок целиком.
 *
 * Кусок считается взятым, только когда число различных `id` сошлось с его `total`.
 * Не сошлось — виноват равный `created_date` у массово заведённых профилей: при равных
 * значениях сортировки offset-пагинация теряет строки на стыке страниц, и заметить это
 * можно единственным способом — сверкой счётчика. Такой кусок дробится окнами
 * по `updated_at` и берётся заново.
 */
const takeChunk = async (
  client: FleetTransport,
  chunk: RegistryChunk,
  counters: Counters,
  onPage: PageHandler,
  seenGlobally: Set<string>,
): Promise<void> => {
  const seen = new Set<string>();
  let stage: ChunkStage = fitsByDepth(chunk.total) ? 'direct' : 'windows';
  // Кусок, прошедший обе ступени дробления, всё равно один: счётчик отвечает на вопрос
  // «скольким кускам не хватило прямого прохода», а не «сколько раз мы дробили».
  let windowed = false;

  for (;;) {
    let segments: { window: ProfilesWindow | null; total: number }[];

    if (stage === 'direct') {
      segments = [{ window: null, total: chunk.total }];
    } else {
      log.info('Кусок берётся окнами', {
        chunk: chunk.title,
        total: chunk.total,
        collected: seen.size,
        reason: STAGE_REASON[stage],
      });

      if (!windowed) {
        windowed = true;
        counters.chunksWindowed += 1;
      }

      segments = await buildWindows(client, chunk, stage);
    }

    for (const segment of segments) {
      for (const pass of passesFor(segment.total)) {
        await walkPass(
          client,
          { filter: chunk.filter, window: segment.window, sortField: 'created_date' },
          pass,
          chunk.title,
          counters,
          onPage,
          seen,
        );
      }
    }

    if (seen.size === chunk.total || stage === 'windows_strict') {
      break;
    }

    // Не сошёлся по счёту — дальше только окна в одну страницу. Ступень «по глубине»
    // тут ничего не даст: она нарежет окна того же размера, что и неудавшийся проход,
    // и повторит ровно ту же потерю.
    stage = 'windows_strict';
  }

  if (seen.size !== chunk.total) {
    throw new RegistryChunkShortError(chunk.title, seen.size, chunk.total);
  }

  for (const profileId of seen) {
    seenGlobally.add(profileId);
  }

  log.info('Кусок закрыт', { chunk: chunk.title, collected: seen.size });
};

/** Полный обход реестра нарезкой. Запускается командой, по расписанию не ходит. */
const crawlFull = async (
  client: FleetTransport,
  counters: Counters,
  onPage: PageHandler,
): Promise<void> => {
  const { registryTotal, chunks } = await buildChunkPlan(client);

  counters.chunksTotal = chunks.length;

  const seenGlobally = new Set<string>();

  for (const chunk of chunks) {
    if (chunk.total === 0) {
      continue;
    }

    await takeChunk(client, chunk, counters, onPage, seenGlobally);
  }

  // Куски сошлись каждый со своим размером, а общий счёт — нет. Так выглядит профиль,
  // не попавший ни в один кусок: например, с `work_status`, которого мы не знаем.
  if (seenGlobally.size !== registryTotal) {
    throw new RegistryChunkShortError('весь реестр', seenGlobally.size, registryTotal);
  }
};
