import { readDriverCard } from '#server/services/drivers/readDriverCard';
import { readUuid } from '#server/utils/query';
import type { DriverCardResponse } from '#shared/types/driver';

// Карточка человека. Не участник программы открывается ею же — с пустыми разделами,
// которые подписывает экран: «такого человека нет» и «человек есть, но не в программе» —
// разные ответы (issue #35).
//
// Подпись статуса — латиницей: она уезжает в строку состояния HTTP, где русскому тексту
// не место. Объяснение по-русски идёт телом ответа.
export default defineEventHandler(async (event): Promise<DriverCardResponse> => {
  const personId = readUuid(getRouterParam(event, 'personId'));

  if (!personId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'идентификатор человека не похож на uuid',
    });
  }

  const card = await readDriverCard(personId);

  if (!card) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'человека с таким идентификатором в реестре нет',
    });
  }

  return card;
});
