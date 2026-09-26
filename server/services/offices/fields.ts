import type { OfficeRow } from '#server/repositories/offices';
import type { Office } from '#shared/types/catalog';

/**
 * Перевод между строкой базы, контрактом ручки и полями формы.
 *
 * Операцией это не является и поэтому лежит отдельным файлом: перевод нужен пяти ручкам
 * офисов сразу, и пятая копия `archived_at → archivedAt` разошлась бы с первой на первой же
 * новой колонке.
 */

/** Строка базы → ответ ручки. Времена уезжают строками: через JSON они всё равно строки. */
export const toOffice = (row: OfficeRow): Office => ({
  officeId: row.id,
  name: row.name,
  address: row.address,
  mapUrl: row.mapUrl,
  workHours: row.workHours,
  phoneE164: row.phoneE164,
  telegram: row.telegram,
  archivedAt: row.archivedAt?.toISOString() ?? null,
  isDemo: row.isDemo,
});

/** Что сервис заведения и правки получает на вход — уже разобранным, без пустых строк. */
export type OfficeFields = {
  name: string;
  address: string;
  mapUrl: string | null;
  workHours: string | null;
  phoneE164: string | null;
  telegram: string | null;
};

/**
 * Необязательное поле формы: пробелы обрезаются, пустое становится `null`.
 *
 * Пустая строка в базе означала бы, что телефон офиса записан пустым, а не что его
 * не записывали, — и отличить одно от другого через полгода было бы нечем.
 */
const optional = (value: unknown): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  return trimmed === '' ? null : trimmed;
};

/**
 * Тело запроса заведения и правки офиса — так, как его видит разбор.
 *
 * Все поля `unknown`: имена приходят от клиента, и типом им верить нельзя. Форма записана
 * здесь, а не в `shared/types/catalog.ts`, потому что там лежит контракт — то, что обещано
 * отправляющему, — а здесь то, чему мы не верим.
 */
export type OfficeRequestFields = {
  name?: unknown;
  address?: unknown;
  mapUrl?: unknown;
  workHours?: unknown;
  phoneE164?: unknown;
  telegram?: unknown;
  /** Только у заведения: правка признак не трогает (issue #212). */
  isDemo?: unknown;
};

/**
 * Поля офиса из тела запроса. `null` — обязательного не хватает, и это разбор запроса,
 * а не отказ человеку: форма без названия до сервера не доходит вовсе (`docs/frontend.md`
 * → «Обязательное поле — свойство поля»), а сюда такой запрос приходит из чужого клиента.
 */
export const readOfficeFields = (
  body: OfficeRequestFields | null | undefined,
): OfficeFields | null => {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const address = typeof body?.address === 'string' ? body.address.trim() : '';

  if (name === '' || address === '') {
    return null;
  }

  return {
    name,
    address,
    mapUrl: optional(body?.mapUrl),
    workHours: optional(body?.workHours),
    phoneE164: optional(body?.phoneE164),
    telegram: optional(body?.telegram),
  };
};
