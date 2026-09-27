import { DemoManagerMissingError } from '#server/services/demo/errors';
import { setDemoManagerOffices } from '#server/services/demo/setDemoManagerOffices';
import {
  OFFICE_SIDE_MISMATCH_MESSAGE,
  OfficeSideMismatchError,
  UnknownOfficeError,
} from '#server/services/offices/errors';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readUuid } from '#server/utils/query';
import { DEMO_EDITOR_ROLES } from '#shared/access';
import type { DemoManagerOfficesResponse } from '#shared/types/demo';

// Демо-офисы демо-менеджера — набором целиком (issue #252). Пустой набор законен.
type OfficesBody = {
  officeIds?: unknown;
};

const badRequest = (message: string) =>
  createError({ statusCode: 400, statusMessage: 'Bad Request', message, data: { field: 'officeIds' } });

export default defineEventHandler(async (event): Promise<DemoManagerOfficesResponse> => {
  await requireEmployeeRole(event, DEMO_EDITOR_ROLES);

  const body = await readBody<OfficesBody | null>(event);

  if (!Array.isArray(body?.officeIds)) {
    throw badRequest('нужен список officeIds');
  }

  // Проверенными значениями, как в составе офиса: строка не uuid роняла бы `::uuid` пятисоткой.
  const officeIds: string[] = [];

  for (const value of body.officeIds) {
    const officeId = readUuid(value);

    if (!officeId) {
      throw badRequest('в списке officeIds есть значение, не похожее на uuid');
    }

    officeIds.push(officeId);
  }

  try {
    return await setDemoManagerOffices(officeIds);
  } catch (error) {
    if (error instanceof DemoManagerMissingError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: 'Демо-менеджера нет — сначала заведите его',
      });
    }

    if (error instanceof UnknownOfficeError) {
      throw badRequest('в списке есть офис, которого нет: обновите страницу');
    }

    if (error instanceof OfficeSideMismatchError) {
      throw badRequest(OFFICE_SIDE_MISMATCH_MESSAGE);
    }

    throw error;
  }
});
