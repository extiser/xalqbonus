import { deskDriverName } from '#server/repositories/deskDriver';
import { findOfficeReward, type OfficeRewardRow } from '#server/repositories/rewards';
import type { OfficeReward } from '#shared/types/rewards';

/**
 * Во что превращается награда на экране сотрудника. Решений здесь нет — только перевод строки
 * в контракт, как `officeOrderView.ts` у заказа.
 */

/** Источник словами карточки стойки. Полной разборкой: новый источник обязан сломать сборку. */
const sourceText = (row: OfficeRewardRow): string => {
  switch (row.source) {
    case 'manual':
      return 'Награда — вручную';
    case 'campaign':
      return row.campaignTitle ? `Награда — акция «${row.campaignTitle}»` : 'Награда — акция';
    // Подарок — баллы без офиса, на стойку он не приходит (issue #219); ветка — ради полноты.
    case 'gift':
      return 'Подарок от Xalq Taxi';
  }
};

/**
 * Почему выдаётся — строкой для карточки стойки. Сотрудник сверяет её с тем, что говорит
 * водитель: «мне за сундук» и «Награда — вручную» — повод переспросить.
 */
const reasonText = (row: OfficeRewardRow): string => {
  const source = sourceText(row);

  return row.sourceNote ? `${source}, ${row.sourceNote}` : source;
};

export const describeOfficeReward = (row: OfficeRewardRow): OfficeReward => ({
  rewardId: row.id,
  kind: row.kind,
  title: row.title,
  status: row.status,
  // Код выданной и сгоревшей освобождён частичным индексом и может принадлежать чужой награде.
  code: row.status === 'awaiting' ? row.code : null,
  officeId: row.officeId,
  officeName: row.officeName,
  driverName: deskDriverName(row),
  callsign: row.callsign,
  phone: row.phone,
  reasonText: reasonText(row),
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
  issuedAt: row.issuedAt?.toISOString() ?? null,
  expiredAt: row.expiredAt?.toISOString() ?? null,
});

/** Одна награда для стойки. `null` — такой награды с офисом нет. */
export const readOfficeReward = async (rewardId: string): Promise<OfficeReward | null> => {
  const row = await findOfficeReward(rewardId);

  return row ? describeOfficeReward(row) : null;
};
