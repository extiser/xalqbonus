import { consola } from 'consola';

import { db } from '#server/db';
import { lockDemoDriver, updateDemoDriverHidden } from '#server/repositories/demo';

/**
 * «Вернуть» спрятанного демо-водителя (issue #252, решение Руслана 27-09-2026): он снова
 * в разделе «Демо», в отборе сегментов и в поиске водителей. Спрятанный всё это время жил —
 * занимал номер генератора, его заказы и награды оставались на стойке демо-менеджера, —
 * поэтому возврат ничего, кроме отметки, не трогает.
 *
 * Не спрятанный — тот же исход: повторное нажатие приводит к тому же состоянию.
 */
const log = consola.withTag('demo:hide');

export type UnhideDemoDriverOutcome =
  | 'shown'
  /** Такого человека нет или он живой. */
  | 'not_demo';

export const unhideDemoDriver = async (personId: string): Promise<UnhideDemoDriverOutcome> => {
  const outcome = await db.$transaction(async (transaction): Promise<UnhideDemoDriverOutcome | 'already_shown'> => {
    const driver = await lockDemoDriver(personId, transaction);

    if (!driver || !driver.isDemo) {
      return 'not_demo';
    }

    if (driver.hiddenAt === null) {
      return 'already_shown';
    }

    await updateDemoDriverHidden(personId, null, transaction);

    return 'shown';
  });

  if (outcome === 'shown') {
    log.info('демо-водитель возвращён', { personId });
  }

  return outcome === 'already_shown' ? 'shown' : outcome;
};
