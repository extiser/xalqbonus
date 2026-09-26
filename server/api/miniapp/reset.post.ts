import { readDemoViewer } from '#server/services/demo/readDemoViewer';
import { requestEmployeeAppRelaunch } from '#server/services/employees/requestEmployeeAppRelaunch';
import { requestAppRelaunch } from '#server/services/notifications/requestAppRelaunch';
import { requireMember } from '#server/utils/miniAppMember';
import { requireTelegramUser } from '#server/utils/telegramAuth';

/**
 * «Сбросить сессию» в профиле. Тела нет, ответ пустой: приложение закрывается при любом
 * исходе, и читать ему нечего.
 *
 * Кто нажал — в том же порядке, что у `me.get.ts`. Демо-зритель первым и в любой роли: его
 * Telegram привязан к его демо-водителю, и приветствие приходит водительское. Затем сотрудник —
 * своим приветствием (issue #250). Остальные — участник программы, как прежде.
 */
export default defineEventHandler(async (event): Promise<void> => {
  const user = requireTelegramUser(event);
  const viewer = await readDemoViewer(user.id);

  if (viewer) {
    await requestAppRelaunch(viewer.personId);
  } else if (!(await requestEmployeeAppRelaunch(user.id))) {
    const driver = await requireMember(event);

    await requestAppRelaunch(driver.personId);
  }

  setResponseStatus(event, 204);
});
