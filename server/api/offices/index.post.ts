import { createOffice } from '#server/services/offices/createOffice';
import { readOfficeFields, type OfficeRequestFields } from '#server/services/offices/fields';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { CATALOG_ROLES } from '#shared/access';
import type { OfficeResponse } from '#shared/types/catalog';

// Заведение офиса. Обязательны название и адрес — остальное необязательно и приезжает
// пустым: у офиса может не быть ни Telegram, ни ссылки на карту.
//
// Пустое обязательное поле — неполный запрос, а не отказ человеку: форму без названия
// останавливает браузер рядом с полем (docs/frontend.md → «Обязательное поле — свойство
// поля»), и досюда такой запрос доходит только из чужого клиента.
export default defineEventHandler(async (event): Promise<OfficeResponse> => {
  await requireEmployeeRole(event, CATALOG_ROLES);

  const fields = readOfficeFields(await readBody<OfficeRequestFields>(event));

  if (!fields) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'нужны название и адрес офиса',
    });
  }

  return { office: await createOffice(fields) };
});
