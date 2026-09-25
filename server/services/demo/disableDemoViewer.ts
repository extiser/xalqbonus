import { consola } from 'consola';

import { db } from '#server/db';
import { closeDemoLink, lockDemoViewer, updateDemoViewerDisabled } from '#server/repositories/demo';

/**
 * Выключение демо-зрителя (issue #205): отметка в списке и закрытая привязка с причиной `demo`.
 * Одной транзакцией — выключенный зритель с живой привязкой остался бы участником.
 *
 * Демо-водитель и его история остаются: повторное внесение вернёт зрителю того же водителя.
 * Telegram зрителя после этого снова ничей, и приложение открывает регистрацию, как до
 * внесения в список.
 */
const log = consola.withTag('demo:viewer');

export type DisableDemoViewerResult =
  | { outcome: 'disabled'; personId: string }
  /** Уже выключен. Ничего не изменено. */
  | { outcome: 'already_disabled'; personId: string }
  /** Этого Telegram в списке нет. */
  | { outcome: 'unknown_viewer' };

export const disableDemoViewer = async (
  telegramUserId: bigint,
  now: Date = new Date(),
): Promise<DisableDemoViewerResult> => {
  const result = await db.$transaction(async (transaction): Promise<DisableDemoViewerResult> => {
    const viewer = await lockDemoViewer(telegramUserId, transaction);

    if (!viewer) {
      return { outcome: 'unknown_viewer' };
    }

    if (viewer.disabledAt !== null) {
      return { outcome: 'already_disabled', personId: viewer.personId };
    }

    await updateDemoViewerDisabled(telegramUserId, now, transaction);
    await closeDemoLink(viewer.personId, now, transaction);

    return { outcome: 'disabled', personId: viewer.personId };
  });

  if (result.outcome === 'disabled') {
    log.info('демо-зритель выключен', { telegramUserId: telegramUserId.toString(), personId: result.personId });
  }

  return result;
};
