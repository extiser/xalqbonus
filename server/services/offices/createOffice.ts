import { consola } from 'consola';
import { insertOffice } from '#server/repositories/offices';
import { toOffice, type OfficeFields } from '#server/services/offices/fields';
import type { Office } from '#shared/types/catalog';

/**
 * Заведение офиса.
 *
 * Проверки уникальности названия нет намеренно: два офиса с одинаковым названием в разных
 * районах — это состояние парка, а не ошибка ввода, и запрет здесь означал бы придумывание
 * названий под ограничение кода.
 *
 * Признак демо ставится здесь и больше нигде (issue #212). Кто вправе его поставить, решила
 * ручка — `requireDemoEditor`.
 */
const log = consola.withTag('offices:create');

export const createOffice = async (fields: OfficeFields, isDemo: boolean): Promise<Office> => {
  const row = await insertOffice({ ...fields, isDemo });

  log.info('офис заведён', { officeId: row.id, name: row.name, isDemo });

  return toOffice(row);
};
