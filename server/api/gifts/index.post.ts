import { grantGift, type GiftRecipient } from '#server/services/gifts/grantGift';
import { readGiftGrant } from '#server/services/gifts/readGiftGrants';
import { denyAccess } from '#server/utils/denial';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { readGiftCoverForm } from '#server/utils/giftCoverForm';
import { rethrowGiftFailure } from '#server/utils/giftFailure';
import { readUuid } from '#server/utils/query';
import { GIFT_SEGMENT_ROLES, REWARD_GRANT_ROLES } from '#shared/access';
import type { GiftGrantRequestBody, GiftGrantResponse } from '#shared/types/rewards';

// Раздача подарка от Xalq Taxi одному водителю или сегменту (issue #219). Тело —
// `multipart/form-data`: поля строками и необязательные обложки на каждом языке файлами,
// одним запросом — раздача не правится, и заводить черновик ради картинки, как у рассылки,
// незачем.
//
// Раздел открыт `REWARD_GRANT_ROLES`; сегменту — только `GIFT_SEGMENT_ROLES`: проверка здесь,
// а не только на экране, — экран лишь прячет выбор. Ответ — раздача с числом родившихся
// подарков и пропущенных.

type Fields = Partial<Record<keyof GiftGrantRequestBody, string>>;

const badRequest = (message: string, field: string) =>
  createError({ statusCode: 400, statusMessage: 'Bad Request', message, data: { field } });

/** Число из формы. Пусто и не число — `null`. */
const readNumber = (value: string | undefined): number | null => {
  if (value === undefined || value.trim() === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const readRecipient = (fields: Fields): GiftRecipient => {
  if (fields.recipientKind === 'person') {
    const personId = readUuid(fields.personId);

    if (personId) {
      return { kind: 'person', personId };
    }
  }

  if (fields.recipientKind === 'segment') {
    const segmentId = readUuid(fields.segmentId);

    if (segmentId) {
      return { kind: 'segment', segmentId };
    }
  }

  throw badRequest('Выберите, кому вручить: водителя или сегмент.', 'recipient');
};

export default defineEventHandler(async (event): Promise<GiftGrantResponse> => {
  const employee = await requireEmployeeRole(event, REWARD_GRANT_ROLES);
  const { fields, covers } = await readGiftCoverForm<keyof GiftGrantRequestBody>(event);
  const recipient = readRecipient(fields);

  if (recipient.kind === 'segment' && !GIFT_SEGMENT_ROLES.includes(employee.role)) {
    throw denyAccess('role_not_allowed');
  }

  let giftGrantId: string;

  try {
    ({ giftGrantId } = await grantGift({
      recipient,
      points: readNumber(fields.points),
      reasonRu: fields.reasonRu ?? '',
      reasonUz: fields.reasonUz ?? '',
      untilDate: fields.untilDate ?? '',
      messageRu: fields.messageRu ?? '',
      messageUz: fields.messageUz ?? '',
      ...covers,
      sendNow: fields.sendNow === 'true',
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
