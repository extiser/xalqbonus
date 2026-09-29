import { consola } from 'consola';

import { db } from '#server/db';
import { shareLockDemoEmployee } from '#server/repositories/employees';
import { findOfficesByIds, listEmployeeOffices, replaceEmployeeOffices } from '#server/repositories/offices';
import { DemoManagerMissingError } from '#server/services/demo/errors';
import {
  OfficeEmployeeDisabledError,
  OfficeSideMismatchError,
  UnknownOfficeError,
} from '#server/services/offices/errors';

/**
 * Демо-офисы демо-менеджера — набором целиком (issue #252). Та же замена набора, что
 * у `setOfficeEmployees`, с другой стороны: строки `employee_offices` демо-менеджера.
 *
 * Только демо-офисы: живой офис — `OfficeSideMismatchError`, та же проверка стороны, что
 * при закреплении со страницы офиса, и в той же транзакции, что запись. Живые офисы,
 * закреплённые за ним до этой проверки, набор снимает: присланное и есть состав.
 *
 * Выключенного демо-менеджера не закрепляют ни за одним офисом — `OfficeEmployeeDisabledError`,
 * как со страницы офиса: выключенный ни за чем не закреплён, без исключений (решение Руслана
 * 29-09-2026, issue #291). Пустой набор ему законен: закреплять в нём нечего. Строка учётки
 * читается под разделяемой блокировкой, чтобы одновременное выключение не разошлось с записью.
 */
const log = consola.withTag('demo:manager');

export const setDemoManagerOffices = async (officeIds: string[]): Promise<{ officeIds: string[] }> => {
  const unique = [...new Set(officeIds)];

  const saved = await db.$transaction(async (transaction) => {
    const manager = await shareLockDemoEmployee('manager', transaction);

    if (!manager) {
      throw new DemoManagerMissingError();
    }

    if (manager.disabledAt !== null && unique.length > 0) {
      throw new OfficeEmployeeDisabledError([manager.id]);
    }

    const offices = await findOfficesByIds(unique, transaction);
    const knownIds = new Set(offices.map((office) => office.id));
    const unknown = unique.find((officeId) => !knownIds.has(officeId));

    if (unknown !== undefined) {
      throw new UnknownOfficeError(unknown);
    }

    const live = offices.filter((office) => !office.isDemo);

    if (live.length > 0) {
      throw new OfficeSideMismatchError(
        live.map((office) => office.id),
        [manager.id],
      );
    }

    await replaceEmployeeOffices(manager.id, unique, transaction);

    return (await listEmployeeOffices(manager.id, transaction)).map((office) => office.id);
  });

  log.info('офисы демо-менеджера записаны', { offices: saved.length });

  return { officeIds: saved };
};
