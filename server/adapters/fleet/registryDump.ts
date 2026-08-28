/**
 * Чтение выгрузки реестра парка из файла.
 *
 * Адаптер внешней системы: знает формат ответа Fleet API и **не знает про базу**
 * (docs/principles.md → «Слои и зависимости»). Разбирает `_reference/fleet-api/dumps/
 * driver-profiles-*.jsonl` — файл, снятый скриптом разведки `scripts/export-registry.py`.
 *
 * Сетевого обхода здесь нет вовсе: реестр заливается разово из файла, а регулярная
 * синхронизация профилей и полный обход нарезкой живут продуктовым кодом и приходят
 * этапом 3 (docs/decisions.md → «Полный обход реестра — режим синхронизации»).
 */
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

/** Профиль парка в том виде, в каком его понимает ядро. Сырой ответ не хранится нигде. */
export type RegistryProfile = {
  profileId: string;
  parkId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  workStatus: string;
  employmentType: string;
  isSelfemployed: boolean;
  workRuleId: string;
  hireDate: Date | null;
  fireDate: Date | null;
  currentStatus: string;
  currentStatusUpdatedAt: Date | null;
  callsign: string | null;
  carId: string | null;
  carNumber: string | null;
  carBrandModel: string | null;
  apiCreatedAt: Date;
  apiModifiedAt: Date;
  apiUpdatedAt: Date;
  license: RegistryLicense;
  phones: string[];
};

export type RegistryLicense = {
  /** Ровно как пришло из API. `normalized_number` не читается: он побайтово равен `number`. */
  numberRaw: string;
  country: string | null;
  issueDate: Date | null;
  expirationDate: Date | null;
};

/**
 * Сопроводительный файл выгрузки. Из него берётся время обхода — начальная отметка
 * синхронизации равна времени выгрузки, а не времени прогона переноса
 * (docs/decisions.md → «Начальная отметка синхронизации»).
 */
export type RegistryDumpMeta = {
  dump: string;
  records: number;
  /** Когда обход закончился. Единственная временная отметка, которую пишет выгрузка. */
  finishedAt: Date;
  /** Сколько он занял. Начало обхода получается вычитанием — из файла, а не из головы. */
  elapsedSeconds: number;
  startedAt: Date;
};

type RawRegistryRecord = {
  updated_at?: string;
  driver_profile?: {
    id?: string;
    park_id?: string;
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    work_status?: string;
    employment_type?: string;
    is_selfemployed?: boolean;
    work_rule_id?: string;
    hire_date?: string;
    fire_date?: string;
    created_date?: string;
    modified_date?: string;
    phones?: string[];
    driver_license?: {
      number?: string;
      country?: string;
      issue_date?: string;
      expiration_date?: string;
    };
  };
  current_status?: { status?: string; status_updated_at?: string };
  car?: {
    id?: string;
    number?: string;
    normalized_number?: string;
    callsign?: string;
    brand?: string;
    model?: string;
  };
};

type RawRegistryMeta = {
  dump?: string;
  records?: number;
  finished_at?: string;
  elapsed_seconds?: number;
};

/** Файл выгрузки повреждён или подсунут не тот. Молча пропускать такую строку нельзя. */
export class RegistryDumpError extends Error {
  constructor(message: string) {
    super(`выгрузка реестра: ${message}`);
    this.name = 'RegistryDumpError';
  }
}

const readDate = (value: string | undefined): Date | null => {
  if (value === undefined || value === '') {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new RegistryDumpError(`дата не разбирается: ${value}`);
  }

  return parsed;
};

const requireDate = (value: string | undefined, field: string, profileId: string): Date => {
  const parsed = readDate(value);

  if (!parsed) {
    throw new RegistryDumpError(`у профиля ${profileId} нет обязательного поля ${field}`);
  }

  return parsed;
};

const requireText = (value: string | undefined, field: string, profileId: string): string => {
  if (value === undefined) {
    throw new RegistryDumpError(`у профиля ${profileId} нет обязательного поля ${field}`);
  }

  return value;
};

/** Марка и модель одной строкой: отдельной таблицы машин нет, машина живёт снимком в профиле. */
const buildCarBrandModel = (brand: string | undefined, model: string | undefined): string | null => {
  const parts = [brand, model].filter((part): part is string => part !== undefined && part !== '');

  return parts.length > 0 ? parts.join(' ') : null;
};

const parseProfile = (record: RawRegistryRecord): RegistryProfile => {
  const profile = record.driver_profile;

  if (!profile?.id) {
    throw new RegistryDumpError('в записи нет driver_profile.id');
  }

  const profileId = profile.id;
  const license = profile.driver_license;

  // Профилей без объекта driver_license в выгрузке ноль. Появившийся — не «пропустим,
  // их мало», а расхождение с разбором, о котором надо узнать сразу.
  if (!license?.number) {
    throw new RegistryDumpError(`у профиля ${profileId} нет номера водительского удостоверения`);
  }

  const car = record.car;

  return {
    profileId,
    parkId: requireText(profile.park_id, 'park_id', profileId),
    firstName: requireText(profile.first_name, 'first_name', profileId),
    lastName: requireText(profile.last_name, 'last_name', profileId),
    middleName: profile.middle_name ?? null,
    workStatus: requireText(profile.work_status, 'work_status', profileId),
    employmentType: requireText(profile.employment_type, 'employment_type', profileId),
    isSelfemployed: profile.is_selfemployed ?? false,
    workRuleId: requireText(profile.work_rule_id, 'work_rule_id', profileId),
    hireDate: readDate(profile.hire_date),
    fireDate: readDate(profile.fire_date),
    currentStatus: requireText(record.current_status?.status, 'current_status.status', profileId),
    currentStatusUpdatedAt: readDate(record.current_status?.status_updated_at),
    callsign: car?.callsign ?? null,
    carId: car?.id ?? null,
    carNumber: car?.number ?? car?.normalized_number ?? null,
    carBrandModel: buildCarBrandModel(car?.brand, car?.model),
    apiCreatedAt: requireDate(profile.created_date, 'created_date', profileId),
    apiModifiedAt: requireDate(profile.modified_date, 'modified_date', profileId),
    apiUpdatedAt: requireDate(record.updated_at, 'updated_at', profileId),
    license: {
      numberRaw: license.number,
      country: license.country ?? null,
      issueDate: readDate(license.issue_date),
      expirationDate: readDate(license.expiration_date),
    },
    phones: profile.phones ?? [],
  };
};

/** Читает выгрузку построчно: 25 390 записей и 34 МБ файла целиком в память не поднимаются. */
export async function* readRegistryDump(dumpPath: string): AsyncGenerator<RegistryProfile> {
  const lines = createInterface({
    input: createReadStream(dumpPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (line.trim() === '') {
      continue;
    }

    yield parseProfile(JSON.parse(line) as RawRegistryRecord);
  }
}

/** Путь к сопроводительному файлу: тот же, что у выгрузки, с расширением `.meta.json`. */
export const buildDumpMetaPath = (dumpPath: string): string =>
  dumpPath.replace(/\.jsonl$/, '.meta.json');

export const readRegistryDumpMeta = async (dumpPath: string): Promise<RegistryDumpMeta> => {
  const metaPath = buildDumpMetaPath(dumpPath);
  const meta = JSON.parse(await readFile(metaPath, 'utf8')) as RawRegistryMeta;

  const finishedAt = readDate(meta.finished_at);

  if (!finishedAt) {
    throw new RegistryDumpError(`в ${metaPath} нет finished_at`);
  }

  if (typeof meta.elapsed_seconds !== 'number') {
    throw new RegistryDumpError(`в ${metaPath} нет elapsed_seconds`);
  }

  return {
    dump: meta.dump ?? dumpPath,
    records: meta.records ?? 0,
    finishedAt,
    elapsedSeconds: meta.elapsed_seconds,
    startedAt: new Date(finishedAt.getTime() - meta.elapsed_seconds * 1000),
  };
};
