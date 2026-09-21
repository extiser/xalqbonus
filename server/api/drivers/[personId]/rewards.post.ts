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
import { readUuid, requireUuidParam } from '#server/utils/query';
import { REWARD_GRANT_ROLES } from '#shared/access';
import type { ManualRewardField, ManualRewardResponse } from '#shared/types/rewards';

// Ручная выдача награды водителю из карточки (issue #172): источник `manual`, автор —
// вошедший сотрудник. Доступ — ролью, тем же правилом, что ручная правка баллов.
//
// Отказы доменных правил — строкой при своей ручке и с полем формы, к которому относятся,
// как у ручной правки баллов (`points.post.ts`).
type ManualRewardBody = {
  kind?: unknown;
  points?: unknown;
  productId?: unknown;
  title?: unknown;
  officeId?: unknown;
  lifetimeDays?: unknown;
  note?: unknown;
};

const PROBLEMS: Readonly<Record<ManualRewardProblem, { field: ManualRewardField; message: string }>> = {
  kind_invalid: { field: 'kind', message: 'выберите, что выдаётся: баллы, товар или своя награда' },
  points_invalid: { field: 'points', message: 'сумма — целое число баллов больше нуля' },
  product_missing: { field: 'productId', message: 'выберите товар' },
  title_missing: { field: 'title', message: 'напишите, что выдаётся' },
  office_missing: { field: 'officeId', message: 'выберите офис, где водитель получит награду' },
  lifetime_invalid: { field: 'lifetimeDays', message: 'срок — целое число дней, не меньше одного' },
  note_missing: {
    field: 'note',
    message: 'пояснение обязательно: его видит сотрудник на стойке и водитель в разделе наград',
  },
};

const rejectField = (statusCode: 400 | 409, field: ManualRewardField, message: string) =>
  createError({
    statusCode,
    statusMessage: statusCode === 400 ? 'Bad Request' : 'Conflict',
    message,
    data: { field },
  });

/** Число из формы: строка с числом принимается наравне с числом. Пусто и не число — `null`. */
const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const readText = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';

  return text === '' ? null : text;
};

export default defineEventHandler(async (event): Promise<ManualRewardResponse> => {
  const employee = await requireEmployeeRole(event, REWARD_GRANT_ROLES);

  const personId = requireUuidParam(event, 'personId');
  const body = await readBody<ManualRewardBody | null>(event);

  try {
    const reward = await grantManualReward({
      personId,
      employeeId: employee.employeeId,
      kind: typeof body?.kind === 'string' ? body.kind : '',
      points: readNumber(body?.points),
      productId: readUuid(body?.productId),
      title: readText(body?.title),
      officeId: readUuid(body?.officeId),
      lifetimeDays: readNumber(body?.lifetimeDays),
      note: typeof body?.note === 'string' ? body.note : '',
    });

    return { rewardId: reward.id, kind: reward.kind, code: reward.code };
  } catch (error) {
    if (error instanceof InvalidManualRewardError) {
      const problem = PROBLEMS[error.problem];

      throw rejectField(400, problem.field, problem.message);
    }

    if (error instanceof RewardStockShortError) {
      throw rejectField(409, 'productId', 'в этом офисе товара нет в свободном остатке');
    }

    if (error instanceof RewardProductUnavailableError) {
      throw rejectField(409, 'productId', 'этот товар не выдаётся: он черновик или в архиве');
    }

    if (error instanceof RewardOfficeUnavailableError) {
      throw rejectField(409, 'officeId', 'офис в архиве и наград не выдаёт');
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
