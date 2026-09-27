import { DemoInviteLabelEmptyError, issueDemoInvite } from '#server/services/demo/issueDemoInvite';
import { BotUnavailableError } from '#server/services/employees/botUnavailableError';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoInviteResponse } from '#shared/types/demo';

// Приглашение в демо (issue #252). Ссылку, пока приглашение живо, отдаёт и сводка раздела.
type DemoInviteBody = {
  label?: unknown;
};

const labelEmpty = () =>
  createError({
    statusCode: 400,
    statusMessage: 'Bad Request',
    message: 'Подпишите зрителя: кто это и откуда',
    data: { field: 'label' },
  });

export default defineEventHandler(async (event): Promise<DemoInviteResponse> => {
  const employee = await requireEmployeeRole(event, DEMO_EDITOR_ROLES);
  const body = await readBody<DemoInviteBody | null>(event);

  if (typeof body?.label !== 'string') {
    throw labelEmpty();
  }

  try {
    const invite = await issueDemoInvite({ label: body.label, invitedById: employee.employeeId });

    return {
      invite: {
        inviteId: invite.inviteId,
        label: invite.label,
        expiresAt: invite.expiresAt.toISOString(),
        link: invite.link,
      },
      link: invite.link,
    };
  } catch (error) {
    if (error instanceof DemoInviteLabelEmptyError) {
      throw labelEmpty();
    }

    // Бота нет — вести ссылке некуда. Состояние машины, а не ошибка владельца.
    if (error instanceof BotUnavailableError) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Service Unavailable',
        message: 'бот не настроен: ссылку приглашения выписывать не на кого',
      });
    }

    throw error;
  }
});
