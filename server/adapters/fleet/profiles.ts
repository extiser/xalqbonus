/**
 * Профили парка из Fleet API: `POST /v1/parks/driver-profiles/list`.
 *
 * **Пагинация здесь offset, а не курсор.** Курсора у этого метода нет, и глубина имеет
 * цену: лимитер Fleet API оценивает стоимость запроса, а не частоту, и страница
 * с десятитысячной записи отбивается мгновенно, тогда как тысяча записей с нуля проходит
 * за полторы секунды (docs/yandex-fleet.md → «Лимитер считает стоимость запроса»).
 * Поэтому выборка режется фильтрами так, чтобы offset оставался мелким; устройство
 * нарезки — в `server/services/sync/registryChunks.ts`.
 *
 * Адаптер не знает про базу: наружу отдаётся разобранная структура, а кто и куда её
 * положит — дело сервиса (docs/principles.md → «Слои и зависимости»). Разбор самого
 * профиля общий с чтением файла выгрузки — `registryProfile.ts`.
 */
import type { FleetTransport } from '#server/adapters/fleet/client';
import {
  parseRegistryProfile,
  ProfileParseError,
  PROFILE_WITHOUT_ID,
  type MalformedProfile,
  type RawRegistryRecord,
  type RegistryProfile,
} from '#server/adapters/fleet/registryProfile';

const PROFILES_PATH = '/v1/parks/driver-profiles/list';
const WORK_RULES_PATH = '/v1/parks/driver-work-rules';

/** Максимум, разрешённый документацией этому методу. */
export const PROFILES_PAGE_SIZE = 1_000;

/** Фильтр куска. Профиль попадает ровно в один кусок по паре `(work_status, work_rule_id)`. */
export type ProfileFilter = {
  workStatus?: readonly string[];
  workRuleId?: readonly string[];
};

/** Полуинтервал по времени последнего обновления профиля. */
export type ProfilesWindow = {
  updatedFrom: Date;
  updatedTo: Date;
};

/**
 * Поле сортировки. Куски полного обхода идут по `created_date` — он у профиля не меняется
 * никогда, и порядок между страницами не переставляется под ногами. Инкрементальный прогон
 * и промер краёв окна идут по `updated_at`.
 */
export type ProfileSortField = 'created_date' | 'updated_at';

export type ProfileSortDirection = 'asc' | 'desc';

const SORT_FIELDS: Record<ProfileSortField, string> = {
  created_date: 'driver_profile.created_date',
  updated_at: 'updated_at',
};

export type ProfilesRequest = {
  filter: ProfileFilter | null;
  window: ProfilesWindow | null;
  sortField: ProfileSortField;
  direction: ProfileSortDirection;
  offset: number;
  limit: number;
};

/**
 * Страница списка профилей.
 *
 * `total` — размер всей выборки по этому фильтру, а не страницы: по нему строится нарезка
 * и по нему же сверяется, что кусок взят целиком.
 */
export type ProfilesPage = {
  /** Сколько профилей пришло в ответе — до разбора. По нему судим о конце выборки. */
  received: number;
  profiles: RegistryProfile[];
  total: number;
  unknownValues: string[];
  /** Профили, которые не удалось разобрать. Не записываются, считаются отдельно. */
  malformed: number;
  /** Кто именно не разобрался. Длина равна `malformed`: на странице список не режется. */
  malformedIds: MalformedProfile[];
};

/** Условие работы парка. Нужно ровно для одного: по куску обхода на каждое из них. */
export type WorkRule = {
  id: string;
  name: string;
};

const readRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readText = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const readCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/**
 * Тело запроса.
 *
 * Сортировка задаётся всегда и явно: обход по offset без устойчивого порядка теряет
 * и дублирует записи между страницами. Времена уходят в UTC — API отдаёт и фильтрует
 * в UTC (docs/yandex-fleet.md).
 */
export const buildProfilesRequestBody = (
  parkId: string,
  request: ProfilesRequest,
): Record<string, unknown> => {
  const park: Record<string, unknown> = { id: parkId };

  if (request.filter) {
    const driverProfile: Record<string, unknown> = {};

    if (request.filter.workStatus) {
      driverProfile['work_status'] = [...request.filter.workStatus];
    }

    if (request.filter.workRuleId) {
      driverProfile['work_rule_id'] = [...request.filter.workRuleId];
    }

    if (Object.keys(driverProfile).length > 0) {
      park['driver_profile'] = driverProfile;
    }
  }

  if (request.window) {
    park['updated_at'] = {
      from: request.window.updatedFrom.toISOString(),
      to: request.window.updatedTo.toISOString(),
    };
  }

  return {
    query: { park },
    sort_order: [{ field: SORT_FIELDS[request.sortField], direction: request.direction }],
    limit: request.limit,
    offset: request.offset,
  };
};

export const parseProfilesPage = (payload: unknown): ProfilesPage => {
  const record = readRecord(payload);
  const rawProfiles = Array.isArray(record?.['driver_profiles']) ? record['driver_profiles'] : [];
  const unknown = new Set<string>();
  const profiles: RegistryProfile[] = [];
  const malformedIds: MalformedProfile[] = [];

  for (const rawProfile of rawProfiles) {
    const asRecord = readRecord(rawProfile);

    if (!asRecord) {
      malformedIds.push({ profileId: PROFILE_WITHOUT_ID, field: '(запись не объект)' });
      continue;
    }

    try {
      profiles.push(parseRegistryProfile(asRecord as RawRegistryRecord, unknown));
    } catch (error) {
      if (error instanceof ProfileParseError) {
        malformedIds.push({ profileId: error.profileId, field: error.field });
        continue;
      }

      throw error;
    }
  }

  return {
    received: rawProfiles.length,
    profiles,
    total: readCount(record?.['total']),
    unknownValues: [...unknown],
    malformed: malformedIds.length,
    malformedIds,
  };
};

/** Читает одну страницу списка профилей. Обход по страницам строит сервис. */
export const readProfilesPage = async (
  client: FleetTransport,
  request: ProfilesRequest,
  description: string,
): Promise<ProfilesPage> => {
  const payload = await client.post(
    PROFILES_PATH,
    buildProfilesRequestBody(client.parkId, request),
    description,
  );

  return parseProfilesPage(payload);
};

/**
 * Размер выборки — полем `total` из ответа на запрос одной записи.
 *
 * Промер стоит один дешёвый запрос и окупается сразу: пустой кусок после него не стоит
 * ни одной страницы, а по размеру непустого выбирается схема прохода.
 */
export const probeProfilesTotal = async (
  client: FleetTransport,
  filter: ProfileFilter | null,
  window: ProfilesWindow | null,
  description: string,
): Promise<number> => {
  const page = await readProfilesPage(
    client,
    { filter, window, sortField: 'created_date', direction: 'asc', offset: 0, limit: 1 },
    description,
  );

  return page.total;
};

/**
 * Крайнее `updated_at` выборки — граница, внутри которой нарезаются окна.
 *
 * Пусто, если выборка пуста. Читается из сырого ответа, а не из разобранного профиля:
 * крайняя запись может не разобраться, а край нужен и тогда.
 */
export const readUpdatedAtEdge = async (
  client: FleetTransport,
  filter: ProfileFilter | null,
  window: ProfilesWindow | null,
  direction: ProfileSortDirection,
  description: string,
): Promise<Date | null> => {
  const payload = await client.post(
    PROFILES_PATH,
    buildProfilesRequestBody(client.parkId, {
      filter,
      window,
      sortField: 'updated_at',
      direction,
      offset: 0,
      limit: 1,
    }),
    description,
  );

  const record = readRecord(payload);
  const profiles = Array.isArray(record?.['driver_profiles']) ? record['driver_profiles'] : [];
  const updatedAt = readText(readRecord(profiles[0])?.['updated_at']);

  if (!updatedAt) {
    return null;
  }

  const parsed = new Date(updatedAt);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Справочник условий работы парка: `GET /v1/parks/driver-work-rules`. */
export const readWorkRules = async (client: FleetTransport): Promise<WorkRule[]> => {
  const payload = await client.get(
    WORK_RULES_PATH,
    { park_id: client.parkId },
    'справочник условий работы',
  );

  const rules = Array.isArray(readRecord(payload)?.['rules']) ? readRecord(payload)?.['rules'] : [];
  const parsed: WorkRule[] = [];

  for (const rule of rules as unknown[]) {
    const id = readText(readRecord(rule)?.['id']);

    if (!id) {
      continue;
    }

    parsed.push({ id, name: readText(readRecord(rule)?.['name']) ?? id });
  }

  return parsed;
};
