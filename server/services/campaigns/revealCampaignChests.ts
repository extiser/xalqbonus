import { consola } from 'consola';
import { db } from '#server/db';
import type { NotificationJobData } from '#server/queues/notifications';
import { findOpenedChest, listOpenedChests } from '#server/repositories/campaignChests';
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
import {
  chestDayNumber,
  grantChestPrizeInTransaction,
} from '#server/services/campaigns/grantChestPrize';
import { frozenFigures } from '#server/services/campaigns/memberProgress';
import { chestLadder, unopenedChests } from '#server/services/campaigns/weekProgress';
import type { CampaignChestRef } from '#server/services/points/idempotencyKey';

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
 * - после всех его сундуков — одно уведомление на человека о том, что реально выдано: что выпало
 *   и где забирать офисное.
 *
 * **Каждый сундук — своя транзакция** со своей блокировкой строки участия. Приз, который нельзя
 * выдать (товара нет на полке), откатывает только свой сундук: остальное водитель получает,
 * а невыданный остаётся закрытым и заработанным до следующего прогона. Так же работает открытие
 * руками, и правило #181 «розыгрыш не пересдаётся» — про один сундук, оно этим не нарушается.
 * Упавший участник не роняет остальных.
 *
 * Повтор ничего не удваивает: под блокировкой проверяется строка сундука — водитель мог открыть
 * его между выборкой и транзакцией, — сама строка уникальна, и тому, у кого ничего не выдано,
 * уведомление не ставится.
 *
 * Участника без исхода вскрытие не трогает: снимка нет, и выдать «объявленное» не из чего. Его
 * возьмёт прогон после итога.
 *
 * После вскрытия акции, где прошло 21:00 у всех половин, исход есть у всех и открывать больше
 * нечего, переводятся в `finished` (`finishSettledCampaigns`). Экран у водителя гаснет и сам — по
 * времени (`findMemberCampaign`).
 */

const log = consola.withTag('campaigns:reveal');

export type RevealChestsSummary = {
  /** Половин, у которых наступило вскрытие и осталось неоткрытое. */
  halves: number;
  /** Участников, которым этим прогоном выдан хотя бы один сундук. */
  participants: number;
  /** Сундуков вскрыто этим прогоном. */
  opened: number;
  /** Сундуков, на которых прогон споткнулся: они остались закрытыми, их возьмёт следующий. */
  failed: number;
  /** Акций переведено в `finished`. */
  finished: number;
  /** Уведомления о вскрытии, поставленные этим прогоном. */
  notifications: NotificationJobData[];
};

/** Чем кончилась транзакция одного сундука. */
type ChestAttempt =
  | { kind: 'opened'; reward: RewardRow }
  /** Сундук открыл водитель между выборкой прогона и блокировкой. */
  | { kind: 'already_opened' }
  /** Строки участия нет — выбрана прогоном и исчезла. */
  | { kind: 'no_participant' };

const revealChest = (
  campaignId: string,
  personId: string,
  chest: CampaignChestRef,
): Promise<ChestAttempt> =>
  db.$transaction(async (transaction): Promise<ChestAttempt> => {
    if (!(await lockCampaignParticipant(campaignId, personId, transaction))) {
      return { kind: 'no_participant' };
    }

    const existing = await findOpenedChest(
      campaignId,
      personId,
      chest.kind,
      chestDayNumber(chest),
      transaction,
    );

    if (existing) {
      return { kind: 'already_opened' };
    }

    return {
      kind: 'opened',
      reward: await grantChestPrizeInTransaction(transaction, {
        campaignId,
        personId,
        chest,
        openedBy: 'timer',
      }),
    };
  });

type ParticipantReveal = { rewards: RewardRow[]; failed: number };

/** Вскрывает неоткрытое участника — по транзакции на сундук. */
const revealParticipant = async (
  campaignId: string,
  participant: ParticipantDueForRevealRow,
): Promise<ParticipantReveal> => {
  const { personId } = participant;
  const { figures, dayTrips } = frozenFigures(participant);
  const chests = unopenedChests(
    chestLadder(figures, dayTrips, await listOpenedChests(campaignId, personId)),
  );

  // SQL отобрал участника как имеющего неоткрытое, а лестница открывать нечего не нашла — два счёта
  // заработанного разошлись. Акция после этого в `finished` не уйдёт никогда: условие перевода
  // смотрит тем же SQL.
  if (chests.length === 0) {
    log.warn('расхождение счётов: SQL видит неоткрытый сундук, лестница — нет', {
      campaignId,
      personId,
    });

    return { rewards: [], failed: 0 };
  }

  const rewards: RewardRow[] = [];
  let failed = 0;

  for (const chest of chests) {
    const context = { campaignId, personId, chest: chest.kind, dayNumber: chestDayNumber(chest) };
    let attempt: ChestAttempt;

    try {
      attempt = await revealChest(campaignId, personId, chest);
    } catch (error) {
      failed += 1;

      // Отказ по остатку уже расписан строкой в `grantChestPrize` — здесь итог по сундуку.
      const failure = {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      };

      if (error instanceof CampaignChestPrizeUnavailableError) {
        log.warn('сундук не вскрыт: приз нельзя выдать, повтор следующим прогоном', failure);
      } else {
        log.error('сундук не вскрыт', failure);
      }

      continue;
    }

    switch (attempt.kind) {
      case 'opened':
        rewards.push(attempt.reward);
        break;
      case 'already_opened':
        log.info('сундук уже открыт водителем — вскрывать нечего', context);
        break;
      case 'no_participant':
        log.info('строки участия нет — вскрытие участника прекращено', context);

        return { rewards, failed };
    }
  }

  return { rewards, failed };
};

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
      let revealed: ParticipantReveal;

      try {
        revealed = await revealParticipant(campaignId, participant);
      } catch (error) {
        // Чтение лестницы до первой транзакции — упавший участник не роняет остальных.
        log.error('сундуки участника не вскрыты', {
          campaignId,
          personId: participant.personId,
          error: error instanceof Error ? error.message : String(error),
        });

        continue;
      }

      failed += revealed.failed;

      if (revealed.rewards.length === 0) {
        continue;
      }

      participantsRevealed += 1;
      opened += revealed.rewards.length;

      const notification = buildRevealedNotification(
        campaign?.title ?? '',
        participant.personId,
        revealed.rewards,
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

  const finished = await finishSettledCampaigns(now, CHEST_REVEAL_HOURS, CHEST_THRESHOLDS);

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
