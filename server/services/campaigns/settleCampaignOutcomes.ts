import { consola } from 'consola';
import {
  finishSettledCampaigns,
  listHalvesDueForOutcome,
  listParticipantsAwaitingOutcome,
  writeParticipantOutcomes,
  type ParticipantOutcomeInput,
} from '#server/repositories/campaigns';
import { decideOutcome, isQualifyingDay } from '#server/services/campaigns/weekProgress';

/**
 * Итог окна (issue #168): каждому участнику половины, чьё окно кончилось, — исход и снимок.
 *
 * Берёт половины идущих акций, у которых прошло `ends_at` плюс четыре часа. Не магическое
 * число: `ends_at` стоит на 05:00 дня после последней даты окна, и 09:00 того же дня — это
 * буфер на опоздавшие из Fleet API поездки (docs/decisions.md → «Сутки — с 05:00 до 05:00
 * по Ташкенту»). Замер отставания — медиана 82 с, максимум 279 с — говорит, что его хватает
 * с запасом.
 *
 * Исход пишется вместе со снимком — зачётными днями и поездками по дням, — из которого
 * замершая неделя рисуется дальше. Пишется только туда, где исхода нет, условием в `UPDATE`:
 * повторный прогон, перезапуск воркера и две одновременные попытки ничего не переписывают,
 * и задним числом исход не пересматривается ни опоздавшей поездкой, ни чем-либо ещё.
 *
 * Акция, у которой исход получили все участники обеих половин, переводится в `finished`.
 *
 * «Сейчас» приходит параметром: момент «через четыре часа после конца окна» тест задаёт
 * явно, а не ждёт.
 */

const log = consola.withTag('campaigns:outcome');

/** Буфер на опоздавшие поездки после конца окна, в часах. */
export const OUTCOME_BUFFER_HOURS = 4;

export type SettleOutcomesSummary = {
  /** Половин с участниками без исхода, чьё окно кончилось с буфером. */
  halves: number;
  /** Исходов проставлено этим прогоном. */
  settled: number;
  /** Акций переведено в `finished`. */
  finished: number;
};

export const settleCampaignOutcomes = async (now: Date): Promise<SettleOutcomesSummary> => {
  const halves = await listHalvesDueForOutcome(now, OUTCOME_BUFFER_HOURS);
  let settled = 0;

  for (const { campaignId, half } of halves) {
    const participants = await listParticipantsAwaitingOutcome(campaignId, half);
    const decided: ParticipantOutcomeInput[] = participants.map((participant) => ({
      personId: participant.personId,
      outcome: decideOutcome(participant.state, participant.dayTrips),
      qualifiedDays: participant.dayTrips.filter(isQualifyingDay).length,
      dayTrips: participant.dayTrips,
    }));

    const written = await writeParticipantOutcomes(campaignId, decided);

    settled += written;
    log.info('итог окна подведён', { campaignId, half, participants: decided.length, written });
  }

  const finished = await finishSettledCampaigns();

  for (const campaignId of finished) {
    log.info('акция окончена: исход есть у всех участников', { campaignId });
  }

  return { halves: halves.length, settled, finished: finished.length };
};
