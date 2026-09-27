import { previewRewardMessage } from '#server/services/rewards/previewRewardMessage';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readUuid } from '#server/utils/query';
import { REWARD_GRANT_ROLES } from '#shared/access';
import type { GiftMessagePreviewResponse, RewardMessagePreviewRequestBody } from '#shared/types/rewards';

// Системный текст ручной награды по тому, что набрано в форме «Вручить» (issue #266) — ничего
// не пишет. Устроено как предпросмотр подарка (`gifts/message-preview.post.ts`): поля могут быть
// пустыми и неверными, на месте того, чего нет, в тексте встаёт подпись поля — «{Где получать}».
//
// `POST`, а не `GET` с полями в адресе: «Почему» — свободный текст сотрудника, как тело формы.
type PreviewBody = Partial<Record<keyof RewardMessagePreviewRequestBody, unknown>>;

const readString = (value: unknown): string => (typeof value === 'string' ? value : '');

export default defineEventHandler(async (event): Promise<GiftMessagePreviewResponse> => {
  await requireEmployeeRole(event, REWARD_GRANT_ROLES);

  const body = await readBody<PreviewBody | null>(event);

  return previewRewardMessage({
    kind: readString(body?.kind),
    productId: readUuid(body?.productId),
    title: readString(body?.title),
    officeId: readUuid(body?.officeId),
    untilDate: readString(body?.untilDate),
    noteRu: readString(body?.noteRu),
    noteUz: readString(body?.noteUz),
  });
});
