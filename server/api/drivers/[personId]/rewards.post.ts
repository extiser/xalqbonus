import { DriverAccountMissingError } from '#server/services/points/errors';
import {
  InvalidManualRewardError,
  RewardOfficeUnavailableError,
  RewardProductUnavailableError,
  RewardStockShortError,
  type ManualRewardProblem,
} from '#server/services/rewards/errors';
import { grantManualReward } from '#server/services/rewards/grantManualReward';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readGiftCoverForm } from '#server/utils/giftCoverForm';
import { explainGiftFailure } from '#server/utils/giftFailure';
import { readUuid, requireUuidParam } from '#server/utils/query';
import { REWARD_GRANT_ROLES } from '#shared/access';
import { GIFT_REASON_MAX_LENGTH } from '#shared/gift';
import type { ManualRewardField, ManualRewardRequestBody, ManualRewardResponse } from '#shared/types/rewards';

// Ручная выдача награды водителю (issue #172): источник `manual`, автор — вошедший сотрудник.
// Доступ — ролью, тем же правилом, что ручная правка баллов. Товар и произвольная; баллы
// сюда не принимаются — они вручаются подарком (`POST /api/gifts`, issue #219).
//
// Тело — `multipart/form-data`, как у раздачи подарка (issue #266): поля строками и обложки
// на каждом языке файлами под теми же именами полей.
//
// Отказы доменных правил — строкой при своей ручке и с полем формы, к которому относятся,
// как у ручной правки баллов (`points.post.ts`). Отказы обложек и своего текста — те же,
// что у подарка, теми же кодами и полями (`giftFailure.ts`).

const PROBLEMS: Readonly<Record<ManualRewardProblem, { field: ManualRewardField; message: string }>> = {
  kind_invalid: { field: 'kind', message: 'выберите, что выдаётся: товар или своя награда' },
  points_via_gift: {
    field: 'kind',
    message: 'баллы вручаются подарком в разделе «Награды», зачислить сразу — ручной правкой баллов',
  },
  product_missing: { field: 'productId', message: 'выберите товар' },
  title_missing: { field: 'title', message: 'напишите, что выдаётся' },
  office_missing: { field: 'officeId', message: 'выберите офис, где водитель получит награду' },
  until_date_invalid: { field: 'untilDate', message: 'укажите дату, до которой забрать' },
  until_date_too_early: { field: 'untilDate', message: 'дата — не раньше завтрашнего дня' },
  note_ru_missing: { field: 'noteRu', message: 'пояснение на русском обязательно' },
  note_uz_missing: { field: 'noteUz', message: 'пояснение на узбекском обязательно' },
  note_ru_too_long: { field: 'noteRu', message: `не длиннее ${GIFT_REASON_MAX_LENGTH} знаков` },
  note_uz_too_long: { field: 'noteUz', message: `не длиннее ${GIFT_REASON_MAX_LENGTH} знаков` },
};

const rejectField = (statusCode: 400 | 409, field: ManualRewardField, message: string) =>
  createError({
    statusCode,
    statusMessage: statusCode === 400 ? 'Bad Request' : 'Conflict',
    message,
    data: { field },
  });

const readText = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';

  return text === '' ? null : text;
};

export default defineEventHandler(async (event): Promise<ManualRewardResponse> => {
  const employee = await requireEmployeeRole(event, REWARD_GRANT_ROLES);

  const personId = requireUuidParam(event, 'personId');
  const { fields, covers } = await readGiftCoverForm<keyof ManualRewardRequestBody>(event);

  try {
    const reward = await grantManualReward({
      personId,
      employeeId: employee.employeeId,
      kind: fields.kind ?? '',
      productId: readUuid(fields.productId),
      title: readText(fields.title),
      officeId: readUuid(fields.officeId),
      untilDate: fields.untilDate ?? '',
      noteRu: fields.noteRu ?? '',
      noteUz: fields.noteUz ?? '',
      messageRu: fields.messageRu ?? '',
      messageUz: fields.messageUz ?? '',
      ...covers,
      sendNow: fields.sendNow === 'true',
    });

    return { rewardId: reward.id, kind: reward.kind, code: reward.code };
  } catch (error) {
    const giftFailure = explainGiftFailure(error);

    if (giftFailure) {
      throw giftFailure;
    }

    if (error instanceof InvalidManualRewardError) {
      const problem = PROBLEMS[error.problem];

      throw rejectField(400, problem.field, problem.message);
    }

    if (error instanceof RewardStockShortError) {
      throw rejectField(409, 'productId', 'в этом офисе товара нет в свободном остатке');
    }

    if (error instanceof RewardProductUnavailableError) {
      throw rejectField(
        409,
        'productId',
        'этот товар не выдаётся: он черновик, в архиве или демо, а водитель живой',
      );
    }

    if (error instanceof RewardOfficeUnavailableError) {
      throw rejectField(
        409,
        'officeId',
        'офис наград этому водителю не выдаёт: он в архиве или не той стороны — демо-водителю только демо-офис, живому только живой',
      );
    }

    if (error instanceof DriverAccountMissingError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: 'водитель не в программе: награду ему вручить некуда',
      });
    }

    throw error;
  }
});
