/**
 * Разбор профиля парка из ответа Fleet API.
 *
 * Один разбор на оба источника: файл выгрузки (`registryDump.ts`) и живой список
 * (`profiles.ts`). В базу профиль обязан приходить одинаково разложенным, откуда бы
 * он ни пришёл, — иначе перенос и синхронизация однажды разойдутся в понимании одного
 * и того же поля, и разойдутся молча.
 *
 * Адаптер внешней системы: знает формат ответа и **не знает про базу**
 * (docs/principles.md → «Слои и зависимости»). Сырой ответ не хранится нигде.
 */

/** Профиль парка в том виде, в каком его понимает ядро. */
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

export type RawRegistryRecord = {
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

/**
 * Словари Fleet API. Чужие словари нам не принадлежат: поля хранятся текстом, перечисления
 * в базу не заводятся (docs/decisions.md → «Перечисления заводим только на свои словари»).
 * Списки нужны ровно для одного — заметить, что на той стороне появилось новое значение,
 * счётчиком в сводке прогона, а не отказом записи.
 */
const KNOWN_WORK_STATUSES = new Set(['working', 'not_working', 'fired']);

const KNOWN_EMPLOYMENT_TYPES = new Set(['selfemployed', 'park_employee', 'individual_entrepreneur']);

const KNOWN_DRIVER_STATUSES = new Set([
  'offline',
  'busy',
  'free',
  'in_order_free',
  'in_order_busy',
]);

/**
 * Профилю не хватило поля, без которого его нельзя ни записать, ни опознать.
 *
 * Пара «профиль и недостающее поле», а не счётчик: прогон при этом продолжается, отметка
 * встаёт на верхнюю границу окна, и профиль больше запрошен не будет. Знать, что потеряно
 * N профилей, и не знать какие — это тот же класс ошибки, против которого написана вся
 * задача, просто со счётчиком вместо тишины.
 */
export class ProfileParseError extends Error {
  constructor(
    public readonly profileId: string,
    public readonly field: string,
  ) {
    super(`профиль ${profileId}: нет обязательного поля ${field}`);
    this.name = 'ProfileParseError';
  }
}

/** Профиль, не прошедший разбор, вместе с полем, которого ему не хватило. */
export type MalformedProfile = {
  /** `(без id)`, если разбор споткнулся до идентификатора. */
  profileId: string;
  field: string;
};

/** Разбор споткнулся до идентификатора: даже сказать, о ком речь, нечем. */
export const PROFILE_WITHOUT_ID = '(без id)';

const readDate = (value: string | undefined, field: string, profileId: string): Date | null => {
  if (value === undefined || value === '') {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    // Дата, которая не разбирается, — это не «поля нет», а поле, которому нельзя верить.
    // Записывать профиль с такой датой хуже, чем не записать вовсе.
    throw new ProfileParseError(profileId, field);
  }

  return parsed;
};

const requireDate = (value: string | undefined, field: string, profileId: string): Date => {
  const parsed = readDate(value, field, profileId);

  if (!parsed) {
    throw new ProfileParseError(profileId, field);
  }

  return parsed;
};

const requireText = (value: string | undefined, field: string, profileId: string): string => {
  if (value === undefined || value === '') {
    throw new ProfileParseError(profileId, field);
  }

  return value;
};

/** Незнакомое значение чужого словаря: остаётся текстом, попадает в счётчик. */
const noteUnknown = (
  known: Set<string>,
  value: string,
  dictionary: string,
  unknown: Set<string>,
): string => {
  if (!known.has(value)) {
    unknown.add(`${dictionary}=${value}`);
  }

  return value;
};

/** Марка и модель одной строкой: отдельной таблицы машин нет, машина живёт снимком в профиле. */
const buildCarBrandModel = (brand: string | undefined, model: string | undefined): string | null => {
  const parts = [brand, model].filter((part): part is string => part !== undefined && part !== '');

  return parts.length > 0 ? parts.join(' ') : null;
};

/**
 * Разбирает одну запись списка профилей.
 *
 * Незнакомые значения словарей копятся в переданное множество строками `словарь=значение` —
 * тем же способом, что у заказов: одно значение приходит из разных словарей и ссылкой
 * быть не может (server/services/sync/syncOrders.ts).
 */
export const parseRegistryProfile = (
  record: RawRegistryRecord,
  unknown: Set<string>,
): RegistryProfile => {
  const profile = record.driver_profile;

  if (!profile?.id) {
    throw new ProfileParseError(PROFILE_WITHOUT_ID, 'driver_profile.id');
  }

  const profileId = profile.id;
  const license = profile.driver_license;

  // Профилей без объекта driver_license в выгрузке ноль. Появившийся не записывается:
  // человек опознаётся номером удостоверения, и завести его без номера значит завести
  // личность, которую никогда не найти повторным прогоном (docs/drivers.md).
  if (!license?.number) {
    throw new ProfileParseError(profileId, 'driver_license.number');
  }

  const car = record.car;

  return {
    profileId,
    parkId: requireText(profile.park_id, 'park_id', profileId),
    firstName: requireText(profile.first_name, 'first_name', profileId),
    lastName: requireText(profile.last_name, 'last_name', profileId),
    middleName: profile.middle_name ?? null,
    workStatus: noteUnknown(
      KNOWN_WORK_STATUSES,
      requireText(profile.work_status, 'work_status', profileId),
      'work_status',
      unknown,
    ),
    employmentType: noteUnknown(
      KNOWN_EMPLOYMENT_TYPES,
      requireText(profile.employment_type, 'employment_type', profileId),
      'employment_type',
      unknown,
    ),
    isSelfemployed: profile.is_selfemployed ?? false,
    workRuleId: requireText(profile.work_rule_id, 'work_rule_id', profileId),
    hireDate: readDate(profile.hire_date, 'hire_date', profileId),
    fireDate: readDate(profile.fire_date, 'fire_date', profileId),
    currentStatus: noteUnknown(
      KNOWN_DRIVER_STATUSES,
      requireText(record.current_status?.status, 'current_status.status', profileId),
      'current_status',
      unknown,
    ),
    currentStatusUpdatedAt: readDate(
      record.current_status?.status_updated_at,
      'current_status.status_updated_at',
      profileId,
    ),
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
      issueDate: readDate(license.issue_date, 'driver_license.issue_date', profileId),
      expirationDate: readDate(
        license.expiration_date,
        'driver_license.expiration_date',
        profileId,
      ),
    },
    phones: profile.phones ?? [],
  };
};
