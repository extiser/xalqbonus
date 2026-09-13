import { consola } from 'consola';
import { updateOfficeArchived } from '#server/repositories/offices';
import { UnknownOfficeError } from '#server/services/offices/errors';
import { toOffice } from '#server/services/offices/fields';
import type { Office } from '#shared/types/catalog';

/**
 * Закрытие офиса и возврат его из архива.
 *
 * Удаления нет и не будет: на офис ссылаются заказы, и заказ обязан помнить, где его
 * выдавали. Архивный офис остаётся в истории целиком — исчезает он только из витрины
 * водителя (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт по офисам»).
 *
 * Остаток при закрытии не обнуляется: товар физически лежит в закрытом офисе, и списать
 * его — отдельное решение человека, оформленное правкой остатка с заметкой.
 */
const log = consola.withTag('offices:archive');

export const setOfficeArchived = async (officeId: string, archived: boolean): Promise<Office> => {
  const row = await updateOfficeArchived(officeId, archived);

  if (!row) {
    throw new UnknownOfficeError(officeId);
  }

  log.info(archived ? 'офис в архиве' : 'офис вернулся из архива', { officeId });

  return toOffice(row);
};
