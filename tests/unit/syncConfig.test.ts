import { afterEach, describe, expect, it } from 'vitest';

import {
  readSyncConfig,
  staleWatermarkThresholdMs,
  syncIntervalMs,
  type SyncConfig,
} from '#server/services/sync/config';

/**
 * Порог, после которого отставание отметки — уже не задержка, а остановка синхронизации.
 *
 * Считается от интервала своего вида прогона: у каждого он свой, и мерить реестр тем же
 * числом, что минутный скользящий, нельзя.
 */

const config: SyncConfig = {
  liveEnabled: true,
  liveIntervalSec: 60,
  catchupEnabled: true,
  catchupIntervalSec: 900,
  catchupDays: 7,
  catchupSliceHours: 12,
  catchupPassEveryHours: 24,
  registryEnabled: true,
  registryIntervalSec: 3_600,
  registryOverlapMinutes: 60,
  registryLagSeconds: 60,
  overlapMinutes: 10,
  lagSeconds: 60,
  pageLimit: 500,
  liveMaxWindowMinutes: 360,
  abandonedRunMinutes: 180,
  staleFloorMinutes: 15,
};

const MINUTE_MS = 60_000;

describe('интервал прогона', () => {
  it('у скользящего свой, у догоняющего свой', () => {
    expect(syncIntervalMs('orders', config)).toBe(60_000);
    expect(syncIntervalMs('orders_catchup', config)).toBe(900_000);
  });

  it('у синхронизации реестра свой', () => {
    // Реестр опрашивается не так, как заказы: это единицы запросов в сутки, и интервал
    // выбирается из потребности, а не из экономии (docs/decisions.md).
    expect(syncIntervalMs('registry', config)).toBe(3_600_000);
  });
});

describe('порог отставания отметки', () => {
  it('у минутного прогона не опускается ниже четверти часа', () => {
    // Три интервала — это три минуты, и жалоба на трёхминутное отставание была бы шумом:
    // прогон, занявший две минуты на бэкоффе, — обычное дело.
    expect(staleWatermarkThresholdMs('orders', config)).toBe(15 * MINUTE_MS);
  });

  it('растёт вместе с интервалом', () => {
    const slow: SyncConfig = { ...config, liveIntervalSec: 600 };

    expect(staleWatermarkThresholdMs('orders', slow)).toBe(30 * MINUTE_MS);
  });

  it('у догоняющего прогона считается от того, как часто он пробует', () => {
    // Позиция идущего прохода, не двигавшаяся три попытки подряд, — тревога.
    expect(staleWatermarkThresholdMs('orders_catchup', config)).toBe(45 * MINUTE_MS);
  });

  it('у догоняющего прогона не опускается ниже нижней границы', () => {
    const eager: SyncConfig = { ...config, catchupIntervalSec: 60 };

    expect(staleWatermarkThresholdMs('orders_catchup', eager)).toBe(15 * MINUTE_MS);
  });

  it('у реестра считается от его собственного часа', () => {
    expect(staleWatermarkThresholdMs('registry', config)).toBe(3 * 60 * MINUTE_MS);
  });

  it('нижняя граница берётся из настроек, а не из константы в коде', () => {
    // Значение назначается по суточному замеру живой синхронизации, и менять его придётся
    // без правки кода. Умолчание при этом остаётся прежним — это проверяет тест выше.
    const patient: SyncConfig = { ...config, staleFloorMinutes: 45 };

    expect(staleWatermarkThresholdMs('orders', patient)).toBe(45 * MINUTE_MS);
  });
});

describe('настройки догона из окружения', () => {
  const NAMES = [
    'SYNC_CATCHUP_INTERVAL_SEC',
    'SYNC_CATCHUP_SLICE_HOURS',
    'SYNC_CATCHUP_PASS_EVERY_HOURS',
    'SYNC_LIVE_OVERLAP_MIN',
    'SYNC_LIVE_LAG_SEC',
  ] as const;
  const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));

  const setEnvironment = (values: Partial<Record<(typeof NAMES)[number], string>>): void => {
    for (const name of NAMES) {
      delete process.env[name];
    }

    Object.assign(process.env, values);
  };

  afterEach(() => {
    for (const name of NAMES) {
      const value = saved[name];

      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('на чистом окружении — попытка раз в четверть часа, куски по 12 часов, проход раз в сутки', () => {
    setEnvironment({});

    const read = readSyncConfig();

    expect(read.catchupIntervalSec).toBe(900);
    expect(read.catchupSliceHours).toBe(12);
    expect(read.catchupPassEveryHours).toBe(24);
  });

  it('берёт значения из окружения', () => {
    setEnvironment({ SYNC_CATCHUP_SLICE_HOURS: '6', SYNC_CATCHUP_PASS_EVERY_HOURS: '48' });

    const read = readSyncConfig();

    expect(read.catchupSliceHours).toBe(6);
    expect(read.catchupPassEveryHours).toBe(48);
  });

  it.each([
    ['SYNC_CATCHUP_SLICE_HOURS', '0'],
    ['SYNC_CATCHUP_SLICE_HOURS', '1.5'],
    ['SYNC_CATCHUP_SLICE_HOURS', 'полдня'],
    ['SYNC_CATCHUP_PASS_EVERY_HOURS', '-24'],
    ['SYNC_CATCHUP_PASS_EVERY_HOURS', '0'],
  ] as const)('%s=%s — отказ на старте', (name, value) => {
    setEnvironment({ [name]: value });

    expect(() => readSyncConfig()).toThrow(name);
  });

  it('кусок не шире перекрытия — отказ: он целиком лежал бы внутри пройденного', () => {
    setEnvironment({ SYNC_CATCHUP_SLICE_HOURS: '1', SYNC_LIVE_OVERLAP_MIN: '60', SYNC_LIVE_LAG_SEC: '60' });

    expect(() => readSyncConfig()).toThrow('SYNC_CATCHUP_SLICE_HOURS');
  });
});
