import { disableDemoViewer } from '#server/services/demo/disableDemoViewer';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireTelegramUserIdParam } from '#server/utils/query';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoViewerStateResponse } from '#shared/types/demo';

// Выключение демо-зрителя (issue #252): привязка к демо-водителю закрывается, приложение
// зрителя снова открывает регистрацию. Повторное выключение — тот же ответ.
export default defineEventHandler(async (event): Promise<DemoViewerStateResponse> => {
  await requireEmployeeRole(event, DEMO_EDITOR_ROLES);

  const telegramUserId = requireTelegramUserIdParam(event, 'telegramUserId');
  const result = await disableDemoViewer(telegramUserId);

  if (result.outcome === 'unknown_viewer') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'такого зрителя в списке нет',
    });
  }

  return { telegramUserId: telegramUserId.toString(), disabled: true };
});
