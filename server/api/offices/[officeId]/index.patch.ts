import { UnknownOfficeError } from '#server/services/offices/errors';
import { readOfficeFields, type OfficeRequestFields } from '#server/services/offices/fields';
import { updateOffice } from '#server/services/offices/updateOffice';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import { CATALOG_ROLES } from '#shared/access';
import type { OfficeResponse } from '#shared/types/catalog';

// Правка офиса. Форма отдаёт все поля сразу, поэтому тело здесь то же, что у заведения:
// частичного обновления у экрана с одной формой не бывает.
//
// Архивность этим запросом не меняется — у неё своя кнопка и своя ручка: поле формы, которым
// можно закрыть офис, поправляя телефон, закрыло бы его однажды случайно.
export default defineEventHandler(async (event): Promise<OfficeResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const officeId = requireUuidParam(event, 'officeId');
  const fields = readOfficeFields(await readBody<OfficeRequestFields>(event));

  if (!fields) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'нужны название и адрес офиса',
    });
  }

  try {
    return { office: await updateOffice(officeId, fields) };
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
