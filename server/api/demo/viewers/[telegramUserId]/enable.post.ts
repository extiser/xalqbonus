import { plainText } from '#server/bot/texts';
import { enableDemoViewer } from '#server/services/demo/enableDemoViewer';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireTelegramUserIdParam } from '#server/utils/query';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoViewerStateResponse } from '#shared/types/demo';

// Включение демо-зрителя (issue #252): повторное внесение с прежней подписью — тот же
// демо-водитель. Отказы — теми же текстами, что отвечает бот на ссылку: отказ один, где бы
// его ни встретили.
export default defineEventHandler(async (event): Promise<DemoViewerStateResponse> => {
  await requireEmployeeRole(event, DEMO_EDITOR_ROLES);

  const telegramUserId = requireTelegramUserIdParam(event, 'telegramUserId');
  const result = await enableDemoViewer(telegramUserId);

  switch (result.outcome) {
    case 'created':
    case 'enabled':
    case 'label_updated':
      return { telegramUserId: telegramUserId.toString(), disabled: false };

    case 'unknown_viewer':
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: 'такого зрителя в списке нет',
      });

    case 'telegram_linked':
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: plainText('demo_invite_telegram_linked', 'ru'),
      });

    case 'telegram_employee':
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: plainText('demo_invite_telegram_employee', 'ru'),
      });

    // Подпись у зрителя из списка непуста, а источник нужен только новому водителю: сюда
    // включение не приходит, и дошедшее — поломка, а не отказ.
    case 'label_empty':
    case 'no_source':
      throw new Error(`включение зрителя ${telegramUserId} вернуло ${result.outcome}`);
  }
});
