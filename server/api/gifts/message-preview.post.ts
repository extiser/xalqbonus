import { previewGiftMessage } from '#server/services/gifts/previewGiftMessage';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { REWARD_GRANT_ROLES } from '#shared/access';
import type { GiftMessagePreviewRequestBody, GiftMessagePreviewResponse } from '#shared/types/rewards';

// Системный текст подарка по тому, что набрано в форме «Вручить» (issue #236) — ничего
// не пишет. Поля могут быть пустыми и неверными: форма зовёт ручку по мере набора, и на месте
// того, чего нет, в тексте встаёт подпись поля — «{Сумма баллов}», — а не отказ.
//
// `POST`, а не `GET` с полями в адресе: повод — свободный текст сотрудника, как тело формы.
type PreviewBody = Partial<Record<keyof GiftMessagePreviewRequestBody, unknown>>;

const readString = (value: unknown): string => (typeof value === 'string' ? value : '');

export default defineEventHandler(async (event): Promise<GiftMessagePreviewResponse> => {
  await requireEmployeeRole(event, REWARD_GRANT_ROLES);

  const body = await readBody<PreviewBody | null>(event);

  return previewGiftMessage({
    points: typeof body?.points === 'number' ? body.points : null,
    reasonRu: readString(body?.reasonRu),
    reasonUz: readString(body?.reasonUz),
    untilDate: readString(body?.untilDate),
  });
});
