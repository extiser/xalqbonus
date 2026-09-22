import { consola } from 'consola';
import { db } from '#server/db';
import type { NotificationJobData } from '#server/queues/notifications';
import { listOpenedChests } from '#server/repositories/campaignChests';
import {
  findCampaign,
  finishSettledCampaigns,
  listHalvesDueForReveal,
  listParticipantsDueForReveal,
  lockCampaignParticipant,
  type ParticipantDueForRevealRow,
} from '#server/repositories/campaigns';
import type { RewardRow } from '#server/repositories/rewards';
import { CHEST_REVEAL_HOURS, CHEST_THRESHOLDS } from '#server/services/campaigns/campaignClock';
import {
  buildRevealedNotification,
  enqueueCampaignNotification,
} from '#server/services/campaigns/campaignNotifications';
import { CampaignChestPrizeUnavailableError } from '#server/services/campaigns/errors';
import { grantChestPrizeInTransaction } from '#server/services/campaigns/grantChestPrize';
import { frozenFigures } from '#server/services/campaigns/memberProgress';
import { chestLadder, unopenedChests } from '#server/services/campaigns/weekProgress';

/**
 * Вскрытие неоткрытых сундуков в 21:00 дня, следующего за последним днём окна (issue #182,
 * docs/decisions.md → «Сундук открывается сразу, как заработан»).
 *
 * Берёт половины, у которых наступило вскрытие, и по каждому участнику с заработанным
 * неоткрытым:
 *
 * - заработанное считается **от снимка итога**, а не от журнала: исход уже объявлен, и вскрытие
 *   обязано выдать ровно то, что объявлено;
 * - каждый неоткрытый открывается тем же путём, что открытие водителем, — `grantChestPrizeInTransaction`
 *   с `opened_by = 'timer'`;
 * - после фиксации — одно уведомление на человека: что выпало и где забирать офисное.
 *
 * Каждый участник — своя транзакция под блокировкой строки участия: упавший на одном не роняет
 * остальных, а открытое у него откатывается целиком и достаётся следующему прогону. Повтор
 * ничего не удваивает: неоткрытое пересчитывается под блокировкой, строка сундука уникальна,
 * и тому, у кого открывать нечего, уведомление не ставится.
 *
 * Участника без исхода вскрытие не трогает: снимка нет, и выдать «объявленное» не из чего. Его
 * возьмёт прогон после итога.
 *
 * После вскрытия акции, где исход есть у всех и открывать больше нечего, переводятся в `finished`.
 * Экран у водителя гаснет раньше и сам — по времени (`findMemberCampaign`).
 */

const log = consola.withTag('campaigns:reveal');

export type RevealChestsSummary = {
  /** Половин, у которых наступило вскрытие и осталось неоткрытое. */
  halves: number;
  /** Участников, у которых сундуки вскрыты этим прогоном. */
  participants: number;
  /** Сундуков вскрыто этим прогоном. */
  opened: number;
  /** Участников, на которых прогон споткнулся: их возьмёт следующий. */
  failed: number;
  /** Акций переведено в `finished`. */
  finished: number;
  /** Уведомления о вскрытии, поставленные этим прогоном. */
  notifications: NotificationJobData[];
};

/** Вскрывает всё неоткрытое участника одной транзакцией. Возвращает рождённые награды. */
const revealParticipant = (
  campaignId: string,
  participant: ParticipantDueForRevealRow,
): Promise<RewardRow[]> =>
  db.$transaction(async (transaction) => {
    if (!(await lockCampaignParticipant(campaignId, participant.personId, transaction))) {
      return [];
    }

    // Под блокировкой, а не из выборки прогона: водитель мог открыть сундук между выборкой
    // и этой строкой.
    const opened = await listOpenedChests(campaignId, participant.personId, transaction);
    const { figures, dayTrips } = frozenFigures(participant);
    const rewards: RewardRow[] = [];

    for (const chest of unopenedChests(chestLadder(figures, dayTrips, opened))) {
      rewards.push(
        await grantChestPrizeInTransaction(transaction, {
          campaignId,
          personId: participant.personId,
          chest,
          openedBy: 'timer',
        }),
      );
    }

    return rewards;
  });

export const revealCampaignChests = async (now: Date): Promise<RevealChestsSummary> => {
  const halves = await listHalvesDueForReveal(now, CHEST_REVEAL_HOURS, CHEST_THRESHOLDS);
  const notifications: NotificationJobData[] = [];
  let participantsRevealed = 0;
  let opened = 0;
  let failed = 0;

  for (const { campaignId, half } of halves) {
    const campaign = await findCampaign(campaignId);
    const participants = await listParticipantsDueForReveal(campaignId, half, CHEST_THRESHOLDS);

    for (const participant of participants) {
      let rewards: RewardRow[];

      try {
        rewards = await revealParticipant(campaignId, participant);
      } catch (error) {
        failed += 1;
        // Отказ по остатку уже расписан строкой в `grantChestPrize` — здесь итог по участнику.
        const context = {
          campaignId,
          personId: participant.personId,
          error: error instanceof Error ? error.message : String(error),
        };

        if (error instanceof CampaignChestPrizeUnavailableError) {
          log.warn(
            'сундуки участника не вскрыты: приз нельзя выдать, повтор следующим прогоном',
            context,
          );
        } else {
          log.error('сундуки участника не вскрыты', context);
        }

        continue;
      }

      if (rewards.length === 0) {
        continue;
      }

      participantsRevealed += 1;
      opened += rewards.length;

      const notification = buildRevealedNotification(
        campaign?.title ?? '',
        participant.personId,
        rewards,
        campaign?.officeName ?? null,
      );

      await enqueueCampaignNotification(notification);
      notifications.push(notification);
    }

    log.info('сундуки половины вскрыты', {
      campaignId,
      half,
      participants: participants.length,
    });
  }

  const finished = await finishSettledCampaigns(CHEST_THRESHOLDS);

  for (const campaignId of finished) {
    log.info('акция окончена: сундуки вскрыты', { campaignId });
  }

  return {
    halves: halves.length,
    participants: participantsRevealed,
    opened,
    failed,
    finished: finished.length,
    notifications,
  };
};
