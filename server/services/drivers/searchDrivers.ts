import { countMatchedDrivers, listMatchedDrivers } from '#server/repositories/drivers';
import {
  buildSearchCriteria,
  hasSearchCriteria,
} from '#server/services/drivers/buildSearchCriteria';
import type { DriverSearchResponse, DriverSearchRow } from '#shared/types/driver';

/**
 * Поиск водителя по всему реестру парка.
 *
 * По реестру, а не по участникам программы: множества разные — около 24 700 человек парка
 * против 4 000 участников, — и на «такого нет» иначе непонятно, нет его в парке или он
 * просто не зарегистрирован. Это разные ответы и разные действия (issue #35, решено
 * 28.08.2026).
 */

/** Сколько строк отдаётся за раз, если страница не попросила иначе. */
const DEFAULT_LIMIT = 25;

/** Потолок страницы: в реестре двадцать пять тысяч человек, и выгружать его целиком нельзя. */
const MAX_LIMIT = 100;

export type DriverSearchRequest = {
  query: string;
  limit: number;
  offset: number;
};

export const searchDrivers = async (
  request: DriverSearchRequest,
): Promise<DriverSearchResponse> => {
  const query = request.query.trim();
  const criteria = buildSearchCriteria(query);
  const limit = Math.min(Math.max(request.limit, 1), MAX_LIMIT);
  const offset = Math.max(request.offset, 0);

  const empty = {
    query,
    licenseCanonical: criteria.licenseCanonical,
    phoneDigits: criteria.phoneDigits,
    nameTerms: criteria.nameTerms,
    limit,
    offset,
  };

  // Пустое поле ввода не запрос: без этой ветки первая же страница экрана выгрузила бы
  // весь реестр парка и назвала бы это результатом поиска.
  if (!hasSearchCriteria(criteria)) {
    return { ...empty, rows: [], total: 0 };
  }

  const [rows, total] = await Promise.all([
    listMatchedDrivers(criteria, limit, offset),
    countMatchedDrivers(criteria),
  ]);

  return {
    ...empty,
    rows: rows.map(
      (row): DriverSearchRow => ({
        personId: row.personId,
        lastName: row.lastName,
        firstName: row.firstName,
        middleName: row.middleName,
        licenseNumberRaw: row.licenseNumberRaw,
        licenseNumberCanonical: row.licenseNumberCanonical,
        phones: row.phones,
        workStatuses: row.workStatuses,
        profilesCount: row.profilesCount,
        isMember: row.isMember,
        // Пусто, а не ноль: «счёта нет» и «на счету ноль» — разные вещи, и подменять
        // первое вторым значит врать о человеке, которого нет в программе.
        balance: row.balance === null ? null : Number(row.balance),
      }),
    ),
    total,
  };
};

export { DEFAULT_LIMIT as DEFAULT_SEARCH_LIMIT };
