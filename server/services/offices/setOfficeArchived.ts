import { consola } from 'consola';
import { db } from '#server/db';
import { detachOfficeEmployees, updateOfficeArchived } from '#server/repositories/offices';
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
 *
 * Архивация снимает закреплённых той же транзакцией (решение Руслана 30-09-2026, как
 * выключение учётной записи в issue #291, issue #303). Возврат из архива закрепления
 * не восстанавливает: закрепляют заново. Кто был закреплён, остаётся только в строке лога.
 */
const log = consola.withTag('offices:archive');

export const setOfficeArchived = async (
  officeId: string,
  archived: boolean,
  actorEmployeeId: string,
): Promise<Office> => {
  const { row, detachedEmployees } = await db.$transaction(async (transaction) => {
    const updated = await updateOfficeArchived(officeId, archived, transaction);

    if (!updated) {
      throw new UnknownOfficeError(officeId);
    }

    return {
      row: updated,
      detachedEmployees: archived ? await detachOfficeEmployees(officeId, transaction) : [],
    };
  });

  if (archived) {
    log.info('офис в архиве', { officeId, actorEmployeeId, detachedEmployees });
  } else {
    log.info('офис вернулся из архива', { officeId, actorEmployeeId });
  }

  return toOffice(row);
};
