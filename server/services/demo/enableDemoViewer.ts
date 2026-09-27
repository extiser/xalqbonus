import { findDemoViewer } from '#server/repositories/demo';
import { addDemoViewer, type AddDemoViewerResult } from '#server/services/demo/addDemoViewer';

/**
 * Включение выключенного зрителя из раздела «Демо» (issue #252) — повторное внесение
 * с прежней подписью: новая привязка к тому же демо-водителю.
 *
 * `unknown_viewer` — такого Telegram в списке нет: включать нечего, а завести нового зрителя
 * отсюда нельзя — он приходит только приглашением.
 */
export type EnableDemoViewerResult = AddDemoViewerResult | { outcome: 'unknown_viewer' };

export const enableDemoViewer = async (telegramUserId: bigint): Promise<EnableDemoViewerResult> => {
  const viewer = await findDemoViewer(telegramUserId);

  if (!viewer) {
    return { outcome: 'unknown_viewer' };
  }

  return addDemoViewer({ telegramUserId, label: viewer.label });
};
