import { consola } from 'consola';
import type { NotificationJobData } from '#server/queues/notifications';
import { listCampaignOpenedChests } from '#server/repositories/campaignChests';
import {
  findCampaign,
  finishSettledCampaigns,
  listHalvesDueForOutcome,
  listParticipantsAwaitingOutcome,
  writeParticipantOutcomes,
  type ParticipantOutcomeInput,
} from '#server/repositories/campaigns';
import { CHEST_THRESHOLDS, OUTCOME_BUFFER_HOURS } from '#server/services/campaigns/campaignClock';
import {
  buildFinishedNotification,
  enqueueCampaignNotification,
} from '#server/services/campaigns/campaignNotifications';
import {
  decideOutcome,
  isQualifyingDay,
  type OpenedChestRef,
} from '#server/services/campaigns/weekProgress';

/**
 * Итог окна (issue #168): каждому участнику половины, чьё окно кончилось, — исход и снимок.
 *
 * Берёт половины идущих акций, у которых прошло `ends_at` плюс четыре часа — 09:00 дня после
 * последней даты окна (`campaignClock.ts`).
 *
 * Исход пишется вместе со снимком — зачётными днями и поездками по дням, — из которого
 * замершая неделя рисуется дальше. Пишется только туда, где исхода нет, условием в `UPDATE`:
 * повторный прогон, перезапуск воркера и две одновременные попытки ничего не переписывают,
 * и задним числом исход не пересматривается ни опоздавшей поездкой, ни чем-либо ещё.
 *
 * Сразу после записи — сообщение об итоге (issue #182), и только тем, у кого исход записан
 * этим прогоном: `UPDATE` возвращает их поимённо, и повторный прогон второго сообщения
 * не шлёт — ему некому.
 *
 * Акция, у которой исход получили все участники обеих половин и не осталось неоткрытых
 * сундуков, переводится в `finished`; с неоткрытыми её доводит вскрытие в 21:00.
 *
 * «Сейчас» приходит параметром: момент «через четыре часа после конца окна» тест задаёт
 * явно, а не ждёт.
 */

const log = consola.withTag('campaigns:outcome');

export type SettleOutcomesSummary = {
  /** Половин с участниками без исхода, чьё окно кончилось с буфером. */
  halves: number;
  /** Исходов проставлено этим прогоном. */
  settled: number;
  /** Акций переведено в `finished`. */
  finished: number;
  /** Сообщения об итоге, поставленные этим прогоном. */
  notifications: NotificationJobData[];
};

/** Открытые сундуки акции по людям. */
const groupOpenedChests = (
  rows: readonly (OpenedChestRef & { personId: string })[],
): Map<string, OpenedChestRef[]> => {
  const byPerson = new Map<string, OpenedChestRef[]>();

  for (const row of rows) {
    byPerson.set(row.personId, [
      ...(byPerson.get(row.personId) ?? []),
      { kind: row.kind, dayNumber: row.dayNumber },
    ]);
  }

  return byPerson;
};

export const settleCampaignOutcomes = async (now: Date): Promise<SettleOutcomesSummary> => {
  const halves = await listHalvesDueForOutcome(now, OUTCOME_BUFFER_HOURS);
  const notifications: NotificationJobData[] = [];
  let settled = 0;

  for (const { campaignId, half } of halves) {
    const participants = await listParticipantsAwaitingOutcome(campaignId, half);
    const decided: ParticipantOutcomeInput[] = participants.map((participant) => ({
      personId: participant.personId,
      outcome: decideOutcome(participant.state, participant.dayTrips),
      qualifiedDays: participant.dayTrips.filter(isQualifyingDay).length,
      dayTrips: participant.dayTrips,
    }));

    const written = new Set(await writeParticipantOutcomes(campaignId, decided));

    settled += written.size;
    log.info('итог окна подведён', {
      campaignId,
      half,
      participants: decided.length,
      written: written.size,
    });

    if (written.size === 0) {
      continue;
    }

    const campaign = await findCampaign(campaignId);
    const opened = groupOpenedChests(await listCampaignOpenedChests(campaignId));

    for (const participant of decided.filter((row) => written.has(row.personId))) {
      const notification = buildFinishedNotification(
        campaign?.title ?? '',
        participant,
        opened.get(participant.personId) ?? [],
      );

      await enqueueCampaignNotification(notification);
      notifications.push(notification);
    }
  }

  const finished = await finishSettledCampaigns(CHEST_THRESHOLDS);

  for (const campaignId of finished) {
    log.info('акция окончена: исход у всех участников, неоткрытых сундуков нет', { campaignId });
  }

  return { halves: halves.length, settled, finished: finished.length, notifications };
};
