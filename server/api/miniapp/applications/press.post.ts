import { recordApplicationPress } from '#server/services/candidates/recordApplicationPress';
import { requireTelegramLaunch } from '#server/utils/telegramAuth';

/**
 * «Нажал кнопку» на экране заявки (issue #484). Тела нет: человек и метка — из проверенной
 * `initData`. Отвечает `204` всегда, кроме неподписанной строки: приложение ответа не ждёт.
 */
export default defineEventHandler(async (event): Promise<null> => {
  const launch = requireTelegramLaunch(event);

  await recordApplicationPress(launch);
  setResponseStatus(event, 204);

  return null;
});
