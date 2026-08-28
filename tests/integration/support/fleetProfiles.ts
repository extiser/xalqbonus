import type { FleetTransport } from '#server/adapters/fleet/client';

/**
 * Поддельный Fleet API для тестов синхронизации профилей.
 *
 * Не заглушка «верни вот эти страницы», а маленькая модель метода `driver-profiles/list`:
 * он честно фильтрует по `work_status` и `work_rule_id`, честно сортирует, честно режет
 * по `offset`/`limit` и отдаёт `total` всей выборки. Иначе полный обход нарезкой проверить
 * нечем: вся его суть — в том, что куски не пересекаются, а число различных `id` сходится
 * с `total`, и с транспортом, который отдаёт заранее заготовленные страницы, это
 * утверждение проверялось бы само собой.
 */

export type FakeFleetOptions = {
  /** Условия работы, которые вернёт справочник. Куски `working` строятся по ним. */
  workRules?: { id: string; name: string }[];
  /**
   * Терять по записи на каждой странице, не уменьшая `total`.
   *
   * Так выглядит потеря на стыке страниц при равных `created_date` — то, ради чего
   * и сделана сверка счётчика. Прогон обязан такой кусок не принять. Страницы в одну
   * запись не трогаются: ими идут промеры размера и краёв окна, и ослеплять их незачем.
   */
  loseFirstOfEachPage?: boolean;
};

export type FakeFleetTransport = FleetTransport & {
  /** Сколько раз спрашивали список. Промеры размеров кусков считаются здесь же. */
  readonly listRequests: number;
};

type RawProfile = Record<string, unknown>;

const readRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const profileField = (profile: RawProfile, field: string): string | undefined => {
  const value = readRecord(profile['driver_profile'])[field];

  return typeof value === 'string' ? value : undefined;
};

const updatedAt = (profile: RawProfile): number =>
  new Date(String(profile['updated_at'] ?? 0)).getTime();

const createdDate = (profile: RawProfile): number =>
  new Date(String(profileField(profile, 'created_date') ?? 0)).getTime();

export const createFakeFleet = (
  profiles: readonly RawProfile[],
  options: FakeFleetOptions = {},
): FakeFleetTransport => {
  let listRequests = 0;

  const select = (body: Record<string, unknown>): RawProfile[] => {
    const query = readRecord(readRecord(body['query'])['park']);
    const filter = readRecord(query['driver_profile']);
    const window = readRecord(query['updated_at']);
    const statuses = Array.isArray(filter['work_status']) ? (filter['work_status'] as string[]) : null;
    const rules = Array.isArray(filter['work_rule_id']) ? (filter['work_rule_id'] as string[]) : null;
    const from = typeof window['from'] === 'string' ? new Date(window['from']).getTime() : null;
    const to = typeof window['to'] === 'string' ? new Date(window['to']).getTime() : null;

    return profiles.filter((profile) => {
      const status = profileField(profile, 'work_status');
      const rule = profileField(profile, 'work_rule_id');

      if (statuses && (!status || !statuses.includes(status))) {
        return false;
      }

      if (rules && (!rule || !rules.includes(rule))) {
        return false;
      }

      if (from !== null && updatedAt(profile) < from) {
        return false;
      }

      // Верхняя граница включительно: полуинтервал в документации не оговорён,
      // и перекрытие безопаснее пропуска.
      return to === null || updatedAt(profile) <= to;
    });
  };

  return {
    parkId: 'test-park',
    get listRequests() {
      return listRequests;
    },
    post: async <Payload>(_path: string, body: unknown): Promise<Payload> => {
      listRequests += 1;

      const request = readRecord(body);
      const selected = select(request);
      const sort = readRecord(Array.isArray(request['sort_order']) ? request['sort_order'][0] : {});
      const descending = sort['direction'] === 'desc';
      const byUpdatedAt = sort['field'] === 'updated_at';

      const ordered = [...selected].sort((left, right) => {
        const value = byUpdatedAt
          ? updatedAt(left) - updatedAt(right)
          : createdDate(left) - createdDate(right);

        // Порядок при равных значениях сортировки API не гарантирует — и именно на этом
        // теряются записи между страницами. Разводим по `id`, чтобы модель была
        // предсказуемой, а потерю страницы задаёт `loseFirstOfEachPage`.
        const tie = String(profileField(left, 'id')).localeCompare(String(profileField(right, 'id')));

        return (value !== 0 ? value : tie) * (descending ? -1 : 1);
      });

      const offset = typeof request['offset'] === 'number' ? request['offset'] : 0;
      const limit = typeof request['limit'] === 'number' ? request['limit'] : 1_000;
      const page = ordered.slice(offset, offset + limit);

      return {
        driver_profiles: options.loseFirstOfEachPage && page.length > 1 ? page.slice(1) : page,
        total: ordered.length,
        limit,
        offset,
      } as Payload;
    },
    get: async <Payload>(): Promise<Payload> =>
      ({ rules: options.workRules ?? [{ id: 'test-work-rule', name: 'ОСНОВНОЙ' }] }) as Payload,
    stats: () => ({ requests: listRequests, rateLimited: 0, waitedMs: 0 }),
  };
};

/** Транспорт, который падает: так выглядит прогон, оборванный на середине. */
export const createFailingFleet = (): FleetTransport => ({
  parkId: 'test-park',
  post: async () => {
    throw new Error('связь оборвалась');
  },
  get: async () => {
    throw new Error('связь оборвалась');
  },
  stats: () => ({ requests: 1, rateLimited: 3, waitedMs: 0 }),
});
