import { grantGift, type GiftRecipient } from '#server/services/gifts/grantGift';
import { readGiftGrant } from '#server/services/gifts/readGiftGrants';
import { denyAccess } from '#server/utils/denial';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowGiftFailure } from '#server/utils/giftFailure';
import { readUuid } from '#server/utils/query';
import { GIFT_SEGMENT_ROLES, REWARD_GRANT_ROLES } from '#shared/access';
import type { GiftGrantRequestBody, GiftGrantResponse } from '#shared/types/rewards';

// Раздача подарка от Xalq Taxi одному водителю или сегменту (issue #219). Раздел открыт
// `REWARD_GRANT_ROLES`; сегменту — только `GIFT_SEGMENT_ROLES`: проверка здесь, а не только
// на экране, — экран лишь прячет выбор. Ответ — раздача с числом родившихся подарков
// и пропущенных.

const badRecipient = () =>
  createError({
    statusCode: 400,
    statusMessage: 'Bad Request',
    message: 'Выберите, кому вручить: водителя или сегмент.',
    data: { field: 'recipient' },
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

const readRecipient = (body: Partial<Record<keyof GiftGrantRequestBody, unknown>> | null): GiftRecipient => {
  if (body?.recipientKind === 'person') {
    const personId = readUuid(body.personId);

    if (personId) {
      return { kind: 'person', personId };
    }
  }

  if (body?.recipientKind === 'segment') {
    const segmentId = readUuid(body.segmentId);

    if (segmentId) {
      return { kind: 'segment', segmentId };
    }
  }

  throw badRecipient();
};

export default defineEventHandler(async (event): Promise<GiftGrantResponse> => {
  const employee = await requireEmployeeRole(event, REWARD_GRANT_ROLES);
  const body = await readBody<Partial<Record<keyof GiftGrantRequestBody, unknown>> | null>(event);
  const recipient = readRecipient(body);

  if (recipient.kind === 'segment' && !GIFT_SEGMENT_ROLES.includes(employee.role)) {
    throw denyAccess('role_not_allowed');
  }

  let giftGrantId: string;

  try {
    ({ giftGrantId } = await grantGift({
      recipient,
      points: readNumber(body?.points),
      reason: typeof body?.reason === 'string' ? body.reason : '',
      untilDate: typeof body?.untilDate === 'string' ? body.untilDate : '',
      employeeId: employee.employeeId,
    }));
  } catch (error) {
    return rethrowGiftFailure(error);
  }

  const grant = await readGiftGrant(giftGrantId);

  if (!grant) {
    throw new Error(`раздача ${giftGrantId} не читается сразу после записи`);
  }

  return { grant };
});
