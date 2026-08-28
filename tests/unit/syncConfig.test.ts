import { describe, expect, it } from 'vitest';

import { staleWatermarkThresholdMs, syncIntervalMs, type SyncConfig } from '#server/services/sync/config';

/**
 * Порог, после которого отставание отметки — уже не задержка, а остановка синхронизации.
 *
 * Считается от интервала своего вида прогона: у догоняющего он в сутки, и мерить его тем же
 * числом, что минутный скользящий, нельзя.
 */

const config: SyncConfig = {
  liveEnabled: true,
  liveIntervalSec: 60,
  catchupEnabled: true,
  catchupIntervalSec: 86_400,
  catchupDays: 7,
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
    expect(syncIntervalMs('orders_catchup', config)).toBe(86_400_000);
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

  it('у догоняющего прогона считается от его собственных суток', () => {
    expect(staleWatermarkThresholdMs('orders_catchup', config)).toBe(3 * 86_400_000);
  });

  it('нижняя граница берётся из настроек, а не из константы в коде', () => {
    // Значение назначается по суточному замеру живой синхронизации, и менять его придётся
    // без правки кода. Умолчание при этом остаётся прежним — это проверяет тест выше.
    const patient: SyncConfig = { ...config, staleFloorMinutes: 45 };

    expect(staleWatermarkThresholdMs('orders', patient)).toBe(45 * MINUTE_MS);
  });
});
