import { requestAppRelaunch } from '#server/services/notifications/requestAppRelaunch';
import { requireMember } from '#server/utils/miniAppMember';

/**
 * «Сбросить сессию» в профиле. Тела нет, ответ пустой: приложение закрывается при любом
 * исходе, и читать ему нечего.
 */
export default defineEventHandler(async (event): Promise<void> => {
  const driver = await requireMember(event);

  await requestAppRelaunch(driver.personId);
  setResponseStatus(event, 204);
});
