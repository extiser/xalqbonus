import { consola } from 'consola';

import type { DemoRole } from '#server/generated/prisma/enums';
import { updateDemoViewerRole } from '#server/repositories/demo';

/**
 * Смена роли демо-зрителем (issue #205). Роль пишется в базу, а не несётся запросами: каждая
 * ручка узнаёт её там же, где узнаёт личность, — и роль, присланную клиентом, не принимает
 * ни одна.
 *
 * `false` — действующего зрителя с этим Telegram нет, и менять нечего.
 */
const log = consola.withTag('demo:role');

export const changeDemoRole = async (telegramUserId: bigint, role: DemoRole): Promise<boolean> => {
  const changed = await updateDemoViewerRole(telegramUserId, role);

  if (changed) {
    log.info('демо-зритель сменил роль', { telegramUserId: telegramUserId.toString(), role });
  }

  return changed;
};
