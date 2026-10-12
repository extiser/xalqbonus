import type { LandingRecord, LandingVersionMeta, LandingVersionRecord } from '#server/repositories/landings';
import { LANDING_CHECK_KEYS } from '#shared/landings';
import type { LandingCheck, LandingCheckKey, LandingRow, LandingVersionView } from '#shared/types/landings';

/**
 * Общее у списка и предпросмотра лендингов (issue #478): какая версия действующая, можно ли
 * лендинг выбрать у метки, строка списка и версия для показа.
 */

/**
 * Действующая версия — последняя по номеру из прошедших проверку: её показывают метки.
 * Не прошедшая замена лежит рядом и действующую не сменяет (docs/decisions.md → «Лендинги
 * в „Промо“»). `null` — ни одна версия не прошла.
 */
export const liveVersionOf = <Version extends Pick<LandingVersionMeta, 'number' | 'passed'>>(
  versions: readonly Version[],
): Version | null =>
  versions.reduce<Version | null>(
    (live, version) => (version.passed && (live === null || version.number > live.number) ? version : live),
    null,
  );

export const lastVersionOf = <Version extends Pick<LandingVersionMeta, 'number'>>(
  versions: readonly Version[],
): Version | null =>
  versions.reduce<Version | null>((last, version) => (last === null || version.number > last.number ? version : last), null);

/** Можно выбрать у метки: есть действующая версия, и лендинг не в архиве. */
export const isSelectable = (record: Pick<LandingRecord, 'archivedAt' | 'versions'>): boolean =>
  record.archivedAt === null && liveVersionOf(record.versions) !== null;

export const toLandingRow = (record: LandingRecord): LandingRow => {
  const last = lastVersionOf(record.versions);

  if (last === null) {
    throw new Error(`у лендинга ${record.id} нет версий`);
  }

  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.versions.length > 1 ? last.createdAt.toISOString() : null,
    labelCount: record.labelCount,
    archived: record.archivedAt !== null,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    selectable: isSelectable(record),
    lastPassed: last.passed,
  };
};

const isCheckKey = (value: unknown): value is LandingCheckKey =>
  typeof value === 'string' && (LANDING_CHECK_KEYS as readonly string[]).includes(value);

/**
 * Итог проверки из `jsonb`: колонку пишет только загрузка, но база типов не знает, и строка
 * не нашего вида — поломка, а не пустая проверка.
 */
export const readLandingChecks = (value: unknown): LandingCheck[] => {
  if (!Array.isArray(value)) {
    throw new Error('проверка версии лендинга — не список');
  }

  return value.map((item: unknown): LandingCheck => {
    if (typeof item !== 'object' || item === null) {
      throw new Error('пункт проверки лендинга — не объект');
    }

    const { key, ok, problems } = item as Record<string, unknown>;

    if (!isCheckKey(key) || typeof ok !== 'boolean' || !Array.isArray(problems)) {
      throw new Error('пункт проверки лендинга не нашего вида');
    }

    return { key, ok, problems: problems.filter((problem): problem is string => typeof problem === 'string') };
  });
};

/** Откуда грузить картинки версии — адрес `server/routes/uploads/landings/[...path].get.ts`. */
export const landingImageBase = (versionId: string): string => `/uploads/landings/${versionId}/`;

export const toLandingVersionView = (version: LandingVersionRecord): LandingVersionView => ({
  number: version.number,
  createdAt: version.createdAt.toISOString(),
  passed: version.passed,
  checks: readLandingChecks(version.checks),
  html: version.html,
  imageBase: landingImageBase(version.id),
});
