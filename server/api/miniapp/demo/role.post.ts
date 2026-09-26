import type { DemoRole } from '#server/generated/prisma/enums';
import { changeDemoRole } from '#server/services/demo/changeDemoRole';
import { requireTelegramUser } from '#server/utils/telegramAuth';
import type { MiniAppDemoRoleRequestBody } from '#shared/types/miniapp';

/**
 * Смена роли демо-зрителем из шторки «Войти как» (issue #205).
 *
 * Чья роль — решает проверенная `initData`; роль пишется в базу, и остальные запросы
 * приложения её не несут. Не действующему зрителю — отказ строкой доменного правила, как
 * у `requireMember`: это не дверь, а «вы не в списке».
 */
const isDemoRole = (value: unknown): value is DemoRole => value === 'driver' || value === 'manager';

export default defineEventHandler(async (event): Promise<void> => {
  const user = requireTelegramUser(event);
  const body = await readBody<Partial<MiniAppDemoRoleRequestBody>>(event);

  if (!isDemoRole(body?.role)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'роль должна быть «driver» или «manager»',
    });
  }

  if (!(await changeDemoRole(user.id, body.role))) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'не демо-зритель',
    });
  }

  setResponseStatus(event, 204);
});
