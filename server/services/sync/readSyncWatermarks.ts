import { readAllSyncStates, type SyncStateRow } from '#server/repositories/syncState';
import { isCatchupPassComplete } from '#server/services/sync/buildOrdersWindow';
import {
  readSyncConfig,
  staleWatermarkThresholdMs,
  syncIntervalMs,
  type ScheduledSyncKind,
  type SyncConfig,
} from '#server/services/sync/config';
import type { SyncStateResponse, SyncWatermark, WatermarkState } from '#shared/types/sync';

/**
 * Отметки синхронизации с состоянием по каждому виду прогона.
 *
 * Состояний три, а не два. Синхронизация реестра сегодня выключена, и её отметка отстаёт
 * на часы штатно: экран, знающий только «работает» и «отстаёт», красил бы это красным
 * и врал. Включённость берётся из конфигурации, а не угадывается по возрасту отметки —
 * возраст у выключенного и у сломавшегося вида прогона выглядит одинаково.
 *
 * Тревога — это застрявшая отметка, а не упавший прогон. Отдельные падения по лимиту
 * Fleet API штатны: упавший прогон не двигает отметку, следующий забирает то же окно
 * и догоняет. Красным поэтому горит только отметка, не сдвинувшаяся дольше порога.
 *
 * У догона отметка — позиция прохода, и стоит она на неделю в прошлом штатно. Тревога
 * у него — проход, который начат и не двигается; пройденный проход, ждущий следующего,
 * спокоен, как бы давно ни стояла позиция.
 */

/** Виды прогона, у которых бывает расписание, в порядке показа. */
const SCHEDULED_KINDS: ScheduledSyncKind[] = ['orders', 'orders_catchup', 'registry'];

/** Стоит ли расписание этого вида прогона на очереди. */
const isScheduled = (kind: ScheduledSyncKind, config: SyncConfig): boolean => {
  if (kind === 'orders_catchup') {
    return config.catchupEnabled;
  }

  if (kind === 'registry') {
    return config.registryEnabled;
  }

  return config.liveEnabled;
};

const decideState = (
  scheduled: boolean,
  lagMs: number | null,
  staleThresholdMs: number,
): WatermarkState => {
  // Выключенный вид прогона показывается спокойным всегда: его отставание — следствие
  // выключателя, а не поломки, и тревогой быть не может по определению.
  if (!scheduled) {
    return 'disabled';
  }

  if (lagMs === null) {
    return 'never';
  }

  return lagMs > staleThresholdMs ? 'stale' : 'ok';
};

/**
 * Состояние догона. Меряется не отставанием позиции от «сейчас», а тем, как давно
 * её трогали: `updated_at` строки двигается с каждым пройденным куском и с началом прохода.
 */
const decideCatchupState = (
  scheduled: boolean,
  state: SyncStateRow | null,
  now: Date,
  staleThresholdMs: number,
): WatermarkState => {
  if (!scheduled) {
    return 'disabled';
  }

  if (!state?.passFrom || !state.passTo) {
    return 'never';
  }

  if (isCatchupPassComplete({ from: state.passFrom, to: state.passTo }, state.watermark)) {
    return 'ok';
  }

  return now.getTime() - state.updatedAt.getTime() > staleThresholdMs ? 'stale' : 'ok';
};

export const readSyncWatermarks = async (): Promise<SyncStateResponse> => {
  const config = readSyncConfig();
  const states = await readAllSyncStates();
  const now = new Date();

  const watermarks: SyncWatermark[] = SCHEDULED_KINDS.map((kind) => {
    const state = states.find((row) => row.kind === kind) ?? null;
    const watermark = state?.watermark ?? null;
    // Отставание считается и у выключенного вида прогона: видеть его полезно — по нему
    // понятно, сколько догонять после включения. Тревогой оно при этом не становится.
    const lagMs = watermark ? now.getTime() - watermark.getTime() : null;
    const scheduled = isScheduled(kind, config);
    const staleThresholdMs = staleWatermarkThresholdMs(kind, config);
    const isCatchup = kind === 'orders_catchup';

    return {
      kind,
      watermark: watermark?.toISOString() ?? null,
      lagMs,
      updatedAt: state?.updatedAt.toISOString() ?? null,
      state: isCatchup
        ? decideCatchupState(scheduled, state, now, staleThresholdMs)
        : decideState(scheduled, lagMs, staleThresholdMs),
      scheduled,
      intervalSec: Math.round(syncIntervalMs(kind, config) / 1_000),
      staleThresholdMs,
      passFrom: isCatchup ? (state?.passFrom?.toISOString() ?? null) : null,
      passTo: isCatchup ? (state?.passTo?.toISOString() ?? null) : null,
    };
  });

  return { now: now.toISOString(), watermarks };
};
