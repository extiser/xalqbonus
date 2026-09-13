import { UnknownOfficeError } from '#server/services/offices/errors';
import { setOfficeArchived } from '#server/services/offices/setOfficeArchived';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { OfficeResponse } from '#shared/types/catalog';

// Закрытие офиса. Удаления нет: на офис ссылаются заказы, и заказ обязан помнить, где его
// выдавали (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт по офисам»).
//
// Повторный запрос на уже закрытый офис отвечает тем же успехом и время закрытия не двигает:
// две нажатые кнопки означают одно и то же состояние.
export default defineEventHandler(async (event): Promise<OfficeResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const officeId = requireUuidParam(event, 'officeId');

  try {
    return { office: await setOfficeArchived(officeId, true) };
  } catch (error) {
    if (error instanceof UnknownOfficeError) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: 'офиса с таким идентификатором нет',
      });
    }

    throw error;
  }
});
