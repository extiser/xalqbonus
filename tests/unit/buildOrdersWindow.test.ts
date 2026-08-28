import { describe, expect, it } from 'vitest';

import { buildOrdersWindow } from '#server/services/sync/buildOrdersWindow';
import type { SyncConfig } from '#server/services/sync/config';

/**
 * Окно опроса — то самое место, где старый бот терял пятую часть поездок: он строил его
 * по времени бронирования и без перекрытия (docs/analysis.md §1.1). Проверяется здесь
 * именно это: границы, перекрытие соседних окон и то, что дыры между ними не остаётся.
 *
 * Тест чистый, без базы: `buildOrdersWindow` — функция от отметки, часов и настроек.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

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
};

const now = new Date('2026-08-28T12:00:00.000Z');

describe('скользящее окно', () => {
  it('идёт от отметки минус перекрытие до текущего момента минус отставание', () => {
    const watermark = new Date('2026-08-28T11:50:00.000Z');

    const window = buildOrdersWindow({ kind: 'orders', watermark, now, config });

    expect(window).not.toBeNull();
    expect(window?.endedFrom.toISOString()).toBe('2026-08-28T11:40:00.000Z');
    expect(window?.endedTo.toISOString()).toBe('2026-08-28T11:59:00.000Z');
  });

  it('соседние прогоны перекрываются, дыры между ними нет', () => {
    const first = buildOrdersWindow({
      kind: 'orders',
      watermark: new Date('2026-08-28T11:50:00.000Z'),
      now,
      config,
    });

    // Отметка встала по верхней границе предыдущего окна, а не по последнему заказу.
    const second = buildOrdersWindow({
      kind: 'orders',
      watermark: first?.endedTo ?? null,
      now: new Date(now.getTime() + MINUTE_MS),
      config,
    });

    expect(second?.endedFrom.getTime()).toBeLessThan(first?.endedTo.getTime() ?? 0);
  });

  it('без отметки берёт только окно перекрытия', () => {
    const window = buildOrdersWindow({ kind: 'orders', watermark: null, now, config });

    expect(window?.endedFrom.toISOString()).toBe('2026-08-28T11:49:00.000Z');
    expect(window?.endedTo.toISOString()).toBe('2026-08-28T11:59:00.000Z');
  });

  it('режет окно потолком, когда воркер долго стоял', () => {
    const watermark = new Date('2026-08-21T12:00:00.000Z');

    const window = buildOrdersWindow({ kind: 'orders', watermark, now, config });

    expect(window?.endedFrom.toISOString()).toBe('2026-08-21T11:50:00.000Z');
    // Шесть часов от нижней границы, а не неделя до текущего момента.
    expect(window?.endedTo.toISOString()).toBe('2026-08-21T17:50:00.000Z');
  });

  it('режет окно так, чтобы следующий прогон продолжил с того же места', () => {
    const first = buildOrdersWindow({
      kind: 'orders',
      watermark: new Date('2026-08-21T12:00:00.000Z'),
      now,
      config,
    });

    const second = buildOrdersWindow({
      kind: 'orders',
      watermark: first?.endedTo ?? null,
      now,
      config,
    });

    expect(second?.endedFrom.getTime()).toBeLessThan(first?.endedTo.getTime() ?? 0);
    expect(second?.endedTo.getTime()).toBeGreaterThan(first?.endedTo.getTime() ?? 0);
  });

  it('отдаёт пусто, когда запрашивать нечего', () => {
    // Отметка впереди верхней границы: так выглядит прогон, запущенный сразу за успешным.
    const watermark = new Date('2026-08-28T12:30:00.000Z');

    expect(buildOrdersWindow({ kind: 'orders', watermark, now, config })).toBeNull();
  });
});

describe('догоняющее окно', () => {
  it('берёт неделю назад, даже когда отметка свежая', () => {
    const watermark = new Date('2026-08-28T11:00:00.000Z');

    const window = buildOrdersWindow({ kind: 'orders_catchup', watermark, now, config });

    expect(window?.endedTo.toISOString()).toBe('2026-08-28T11:59:00.000Z');
    expect(window?.endedFrom.toISOString()).toBe('2026-08-21T11:59:00.000Z');
  });

  it('не оставляет пропуска, если не отрабатывал дольше своей ширины', () => {
    const watermark = new Date('2026-08-08T12:00:00.000Z');

    const window = buildOrdersWindow({ kind: 'orders_catchup', watermark, now, config });

    expect(window?.endedFrom.toISOString()).toBe('2026-08-08T11:50:00.000Z');
    expect((window?.endedTo.getTime() ?? 0) - (window?.endedFrom.getTime() ?? 0)).toBeGreaterThan(
      config.catchupDays * DAY_MS,
    );
  });

  it('без отметки берёт ровно свою ширину', () => {
    const window = buildOrdersWindow({ kind: 'orders_catchup', watermark: null, now, config });

    expect(window?.endedFrom.toISOString()).toBe('2026-08-21T11:59:00.000Z');
  });
});
