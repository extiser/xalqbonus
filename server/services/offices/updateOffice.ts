import { updateOfficeFields } from '#server/repositories/offices';
import { UnknownOfficeError } from '#server/services/offices/errors';
import { toOffice, type OfficeFields } from '#server/services/offices/fields';
import type { Office } from '#shared/types/catalog';

/**
 * Правка офиса: форма отдаёт все поля сразу, и здесь они все и записываются.
 *
 * Отметка архива этой правкой не двигается: закрыть и открыть офис — своё действие
 * и своя кнопка, а не поле формы, которое можно задеть, поправляя телефон.
 */
export const updateOffice = async (officeId: string, fields: OfficeFields): Promise<Office> => {
  const row = await updateOfficeFields(officeId, fields);

  if (!row) {
    throw new UnknownOfficeError(officeId);
  }

  return toOffice(row);
};
