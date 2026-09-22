import { listDriverRewards, type DriverRewardRow } from '#server/repositories/rewards';
import type { DriverReward, DriverRewardsResponse } from '#shared/types/rewards';

/**
 * Награды водителя в карточке сотрудника (issue #175) — только просмотр: выдача идёт по коду
 * у стойки, и отметка «выдал без кода» из карточки сняла бы след, ради которого код заведён.
 */

/**
 * Сколько наград показывается — потолок как у заказов водителя. Листания нет: наград
 * у человека единицы, и потолок стоит, чтобы ответ не рос без предела.
 */
const DRIVER_REWARDS_LIMIT = 50;

const toDriverReward = (row: DriverRewardRow): DriverReward => ({
  rewardId: row.id,
  kind: row.kind,
  status: row.status,
  title: row.title,
  points: row.points,
  // Код выданной и сгоревшей освобождён частичным индексом и может принадлежать чужой награде:
  // назвать его водителю по телефону значило бы назвать чужой.
  code: row.status === 'awaiting' ? row.code : null,
  officeName: row.officeName,
  expiresAt: row.expiresAt?.toISOString() ?? null,
  issuedAt: row.issuedAt?.toISOString() ?? null,
  issuedByName: row.issuedByName,
  expiredAt: row.expiredAt?.toISOString() ?? null,
  source: row.source,
  campaignTitle: row.campaignTitle,
  sourceNote: row.sourceNote,
  grantedByName: row.grantedByName,
  createdAt: row.createdAt.toISOString(),
});

export const readDriverRewards = async (personId: string): Promise<DriverRewardsResponse> => {
  const rows = await listDriverRewards(personId, DRIVER_REWARDS_LIMIT);

  return { rewards: rows.map(toDriverReward) };
};
