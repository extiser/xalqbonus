import { giftCoverUrl } from '#server/adapters/uploads/giftCovers';
import { findGiftGrant, listGiftGrants, type GiftGrantRow } from '#server/repositories/gifts';
import type { GiftGrant, GiftGrantsResponse } from '#shared/types/rewards';

/**
 * Раздачи подарков глазами сотрудника (issue #219): кому, что, кто выдал и что стало
 * с подарками — забрали сами, зачислено по сроку, ждут.
 */

/**
 * Сколько раздач в списке. Листания нет: раздачи — по праздникам и поводам, их десятки
 * за год, а потолок стоит, чтобы ответ не рос без предела.
 */
const GIFT_GRANTS_LIMIT = 100;

const driverName = (row: GiftGrantRow): string | null => {
  const name = [row.lastName, row.firstName].filter((part): part is string => Boolean(part)).join(' ');

  return name === '' ? null : name;
};

const toGiftGrant = (row: GiftGrantRow): GiftGrant => ({
  giftGrantId: row.id,
  createdAt: row.createdAt.toISOString(),
  recipientKind: row.segmentId === null ? 'person' : 'segment',
  personId: row.personId,
  driverName: driverName(row),
  segmentId: row.segmentId,
  segmentName: row.segmentName,
  points: row.points,
  reasonRu: row.reasonRu,
  reasonUz: row.reasonUz,
  coverUrl: giftCoverUrl(row.coverPath),
  // Столбец `date` приходит полуночью UTC — день берётся из неё как есть, без зоны.
  untilDate: row.untilDate.toISOString().slice(0, 10),
  grantedByName: row.grantedByName,
  recipients: row.recipients,
  skipped: row.skipped,
  claimedByDriver: row.claimedByDriver,
  creditedAuto: row.creditedAuto,
  waiting: row.waiting,
});

export const readGiftGrants = async (): Promise<GiftGrantsResponse> => {
  const rows = await listGiftGrants(GIFT_GRANTS_LIMIT);

  return { grants: rows.map(toGiftGrant) };
};

/** Одна раздача — ответ на неё саму. `null` — такой нет. */
export const readGiftGrant = async (giftGrantId: string): Promise<GiftGrant | null> => {
  const row = await findGiftGrant(giftGrantId);

  return row ? toGiftGrant(row) : null;
};
