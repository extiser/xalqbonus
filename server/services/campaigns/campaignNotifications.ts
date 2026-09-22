import { consola } from 'consola';
import type { RevealedPrize } from '#server/bot/notifications';
import type { CampaignParticipantOutcome } from '#server/generated/prisma/enums';
import { enqueueNotification, type NotificationJobData } from '#server/queues/notifications';
import type { RewardRow } from '#server/repositories/rewards';
import { frozenFigures } from '#server/services/campaigns/memberProgress';
import {
  chestLadder,
  unopenedChests,
  type OpenedChestRef,
} from '#server/services/campaigns/weekProgress';

/**
 * Два уведомления конца акции — итог в 09:00 и вскрытие в 21:00 (issue #182).
 *
 * Постановка не роняет прогон: исходы и призы уже записаны, и уронить прогон из-за недоступного
 * Redis значило бы разменять записанное на уведомление — как у приветственного бонуса
 * (`awardWelcomeBonus`). Потерянное уведомление стоит строки в логе.
 */

const log = consola.withTag('campaigns:notify');

/** Участник, получивший исход этим прогоном, — со снимком, из которого считается неоткрытое. */
export type SettledParticipant = {
  personId: string;
  outcome: CampaignParticipantOutcome;
  qualifiedDays: number;
  dayTrips: number[];
};

/** Сообщение об итоге: исход, зачётные дни и сколько заработанного осталось неоткрытым. */
export const buildFinishedNotification = (
  title: string,
  participant: SettledParticipant,
  opened: readonly OpenedChestRef[],
): NotificationJobData => {
  const windowDays = participant.dayTrips.length;
  const { figures, dayTrips } = frozenFigures({
    windowDays,
    qualifiedDays: participant.qualifiedDays,
    outcomeDayTrips: participant.dayTrips,
  });

  return {
    personId: participant.personId,
    template: 'campaign_finished',
    params: {
      title,
      outcome: participant.outcome,
      qualifiedDays: participant.qualifiedDays,
      windowDays,
      unopenedChests: unopenedChests(chestLadder(figures, dayTrips, opened)).length,
    },
  };
};

/**
 * Сообщение о вскрытии: что выпало из каждого вскрытого сундука и где забирать офисное. Срок —
 * самый ранний из офисных наград: они рождаются одной транзакцией с одним сроком акции, но
 * назвать водителю позднюю дату значило бы однажды соврать.
 */
export const buildRevealedNotification = (
  title: string,
  personId: string,
  rewards: readonly RewardRow[],
  officeName: string | null,
): NotificationJobData => {
  const prizes = rewards.map(
    (reward): RevealedPrize =>
      reward.kind === 'points' && reward.points !== null
        ? { kind: 'points', points: reward.points }
        : { kind: 'office', title: reward.title },
  );
  const expiries = rewards
    .filter((reward) => reward.kind !== 'points' && reward.expiresAt !== null)
    .map((reward) => reward.expiresAt?.getTime() ?? 0);

  return {
    personId,
    template: 'campaign_chests_revealed',
    params: {
      title,
      prizes,
      officeName,
      expiresAt: expiries.length > 0 ? new Date(Math.min(...expiries)).toISOString() : null,
    },
  };
};

/** Ставит уведомление; отказ очереди — строка в логе, а не упавший прогон. */
export const enqueueCampaignNotification = async (job: NotificationJobData): Promise<void> => {
  try {
    await enqueueNotification(job);
  } catch (error) {
    log.error('уведомление акции не поставлено в очередь', {
      template: job.template,
      personId: job.personId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
