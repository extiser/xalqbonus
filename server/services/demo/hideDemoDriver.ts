import { consola } from 'consola';

import { db } from '#server/db';
import { lockDemoDriver, updateDemoDriverHidden } from '#server/repositories/demo';

/**
 * «Спрятать» сгенерированного демо-водителя (issue #252): он уходит из раздела «Демо»,
 * из отбора сегментов и из поиска водителей. Журнал, поездки, заказы и награды остаются —
 * это не удаление, и итоги его по-прежнему не считают по `is_demo`.
 *
 * Водителя зрителя не прячут: его прячет выключение зрителя, и второй способ дал бы
 * действующего зрителя без водителя в разделе. Вернуть спрятанного — `unhideDemoDriver`.
 */
const log = consola.withTag('demo:hide');

export type HideDemoDriverOutcome =
  | 'hidden'
  /** Уже спрятан. Ничего не изменено. */
  | 'already_hidden'
  /** Такого человека нет или он живой. */
  | 'not_demo'
  /** Водитель зрителя. */
  | 'viewer_driver';

export const hideDemoDriver = async (personId: string, now: Date = new Date()): Promise<HideDemoDriverOutcome> => {
  const outcome = await db.$transaction(async (transaction): Promise<HideDemoDriverOutcome> => {
    const driver = await lockDemoDriver(personId, transaction);

    if (!driver || !driver.isDemo) {
      return 'not_demo';
    }

    if (driver.hasViewer) {
      return 'viewer_driver';
    }

    if (driver.hiddenAt !== null) {
      return 'already_hidden';
    }

    await updateDemoDriverHidden(personId, now, transaction);

    return 'hidden';
  });

  if (outcome === 'hidden') {
    log.info('демо-водитель спрятан', { personId });
  }

  return outcome;
};
