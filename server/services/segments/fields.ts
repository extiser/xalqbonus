import type { SegmentRow } from '#server/repositories/segments';
import {
  EmptySegmentConditionsError,
  InvalidSegmentFieldsError,
} from '#server/services/segments/errors';
import { hasSegmentConditions } from '#shared/segment';
import type { Segment, SegmentConditions } from '#shared/types/segment';

/**
 * Перевод между строкой базы, контрактом ручки и телом запроса.
 *
 * Операцией это не является и поэтому лежит отдельным файлом: разбор условий нужен
 * и сохранению, и предпросмотру несохранённого, и второй разбор тех же границ разошёлся бы
 * с первым — предпросмотр принял бы то, что сохранение отвергнет.
 */

/**
 * Строка базы → ответ ручки. Баланс уезжает числом: `bigint` JSON не знает.
 *
 * Колонки границ баланса — `bigint`, а контракт — `number`, и честен он только до 2^53:
 * граница дальше `Number.MAX_SAFE_INTEGER` потеряет точность здесь молча, а на входе её
 * не пропустит `readBound` (`Number.isSafeInteger`). Колонку не стоит считать честной
 * по всему диапазону `bigint`. Практически недостижимо — балансы парка на много порядков
 * меньше, — поэтому контракт не переведён на строку.
 */
export const toSegmentConditions = (row: SegmentRow): SegmentConditions => ({
  daysSinceTripMin: row.daysSinceTripMin,
  daysSinceTripMax: row.daysSinceTripMax,
  programMember: row.programMember,
  telegramLinked: row.telegramLinked,
  balanceMin: row.balanceMin === null ? null : Number(row.balanceMin),
  balanceMax: row.balanceMax === null ? null : Number(row.balanceMax),
});

export const toSegment = (row: SegmentRow): Segment => ({
  segmentId: row.id,
  name: row.name,
  description: row.description,
  conditions: toSegmentConditions(row),
  isDemo: row.isDemo,
  createdByName: row.createdByName,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  archivedAt: row.archivedAt?.toISOString() ?? null,
});

/** Что сервис заведения и правки получает на вход — уже разобранным. */
export type SegmentFields = {
  name: string;
  description: string | null;
  conditions: SegmentConditions;
};

/**
 * Тело запроса так, как его видит разбор: всё `unknown`, типом присланному не верим.
 * Форма записана здесь, а не в `shared/types/segment.ts`: там обещанное отправляющему,
 * здесь то, чему мы не верим.
 */
export type SegmentConditionsRequest = {
  daysSinceTripMin?: unknown;
  daysSinceTripMax?: unknown;
  programMember?: unknown;
  telegramLinked?: unknown;
  balanceMin?: unknown;
  balanceMax?: unknown;
};

export type SegmentRequestFields = {
  name?: unknown;
  description?: unknown;
  conditions?: unknown;
  /** Только у заведения и предпросмотра несохранённого: правка признак не трогает (issue #212). */
  isDemo?: unknown;
};

const asConditionsRequest = (value: unknown): SegmentConditionsRequest =>
  typeof value === 'object' && value !== null ? (value as SegmentConditionsRequest) : {};

/**
 * Граница: пусто — не задана, иначе целое число. Строкой приходит тоже — числовое поле формы
 * отдаёт то, что набрано.
 */
const readBound = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);

  if (typeof value === 'boolean' || !Number.isSafeInteger(parsed)) {
    throw new InvalidSegmentFieldsError('bound_not_integer');
  }

  return parsed;
};

/** Признак: `true`, `false` или не задан. Иное — не «не важно», а испорченный запрос. */
const readFlag = (value: unknown): boolean | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'boolean') {
    throw new InvalidSegmentFieldsError('flag_invalid');
  }

  return value;
};

/**
 * Условия из тела запроса. Проверяет то же, что проверки базы (`segments_*_check`), —
 * чтобы предпросмотр несохранённого отвечал на перевёрнутые границы тем же отказом,
 * что сохранение, а не пустым составом, который выглядит как «таких водителей нет».
 */
export const readSegmentConditions = (value: unknown): SegmentConditions => {
  const request = asConditionsRequest(value);

  const conditions: SegmentConditions = {
    daysSinceTripMin: readBound(request.daysSinceTripMin),
    daysSinceTripMax: readBound(request.daysSinceTripMax),
    programMember: readFlag(request.programMember),
    telegramLinked: readFlag(request.telegramLinked),
    balanceMin: readBound(request.balanceMin),
    balanceMax: readBound(request.balanceMax),
  };

  if (
    (conditions.daysSinceTripMin !== null && conditions.daysSinceTripMin < 0) ||
    (conditions.daysSinceTripMax !== null && conditions.daysSinceTripMax < 0)
  ) {
    throw new InvalidSegmentFieldsError('days_negative');
  }

  if (
    conditions.daysSinceTripMin !== null &&
    conditions.daysSinceTripMax !== null &&
    conditions.daysSinceTripMin > conditions.daysSinceTripMax
  ) {
    throw new InvalidSegmentFieldsError('days_reversed');
  }

  if (
    conditions.balanceMin !== null &&
    conditions.balanceMax !== null &&
    conditions.balanceMin > conditions.balanceMax
  ) {
    throw new InvalidSegmentFieldsError('balance_reversed');
  }

  if (!hasSegmentConditions(conditions)) {
    throw new EmptySegmentConditionsError();
  }

  return conditions;
};

/**
 * Поля сегмента из тела запроса. Имя обязательно: пустое останавливает браузер рядом с полем
 * (docs/frontend.md → «Обязательное поле — свойство поля»), сюда такое приходит из чужого
 * клиента. Пустое описание становится `null`: «не писали» и «записали пустым» — разное.
 */
export const readSegmentFields = (body: SegmentRequestFields | null | undefined): SegmentFields => {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (name === '') {
    throw new InvalidSegmentFieldsError('name_missing');
  }

  const description = typeof body?.description === 'string' ? body.description.trim() : '';

  return {
    name,
    description: description === '' ? null : description,
    conditions: readSegmentConditions(body?.conditions),
  };
};
