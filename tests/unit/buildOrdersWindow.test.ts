import { describe, expect, it } from 'vitest';

import {
  buildOrdersWindow,
  nextCatchupSlice,
  planCatchupPass,
  type CatchupPass,
} from '#server/services/sync/buildOrdersWindow';
import type { SyncConfig } from '#server/services/sync/config';

/**
 * Окно опроса — то самое место, где старый бот терял пятую часть поездок: он строил его
 * по времени бронирования и без перекрытия (docs/analysis.md §1.1). Проверяется здесь
 * именно это: границы, перекрытие соседних окон и то, что дыры между ними не остаётся.
 *
 * Догон проверяется своим устройством: проход, куски от старых к новым, перекрытие на стыке
 * и продолжение с позиции (issue #286).
 *
 * Тест чистый, без базы: окно, план прохода и кусок — функции от состояния, часов и настроек.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

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

const now = new Date('2026-08-28T12:00:00.000Z');

describe('скользящее окно', () => {
  it('идёт от отметки минус перекрытие до текущего момента минус отставание', () => {
    const watermark = new Date('2026-08-28T11:50:00.000Z');

    const window = buildOrdersWindow({ watermark, now, config });

    expect(window).not.toBeNull();
    expect(window?.endedFrom.toISOString()).toBe('2026-08-28T11:40:00.000Z');
    expect(window?.endedTo.toISOString()).toBe('2026-08-28T11:59:00.000Z');
  });

  it('соседние прогоны перекрываются, дыры между ними нет', () => {
    const first = buildOrdersWindow({
      watermark: new Date('2026-08-28T11:50:00.000Z'),
      now,
      config,
    });

    // Отметка встала по верхней границе предыдущего окна, а не по последнему заказу.
    const second = buildOrdersWindow({
      watermark: first?.endedTo ?? null,
      now: new Date(now.getTime() + MINUTE_MS),
      config,
    });

    expect(second?.endedFrom.getTime()).toBeLessThan(first?.endedTo.getTime() ?? 0);
  });

  it('без отметки берёт только окно перекрытия', () => {
    const window = buildOrdersWindow({ watermark: null, now, config });

    expect(window?.endedFrom.toISOString()).toBe('2026-08-28T11:49:00.000Z');
    expect(window?.endedTo.toISOString()).toBe('2026-08-28T11:59:00.000Z');
  });

  it('режет окно потолком, когда воркер долго стоял', () => {
    const watermark = new Date('2026-08-21T12:00:00.000Z');

    const window = buildOrdersWindow({ watermark, now, config });

    expect(window?.endedFrom.toISOString()).toBe('2026-08-21T11:50:00.000Z');
    // Шесть часов от нижней границы, а не неделя до текущего момента.
    expect(window?.endedTo.toISOString()).toBe('2026-08-21T17:50:00.000Z');
  });

  it('режет окно так, чтобы следующий прогон продолжил с того же места', () => {
    const first = buildOrdersWindow({
      watermark: new Date('2026-08-21T12:00:00.000Z'),
      now,
      config,
    });

    const second = buildOrdersWindow({
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

    expect(buildOrdersWindow({ watermark, now, config })).toBeNull();
  });
});

const at = (iso: string): Date => new Date(iso);

/** Проход целиком, кусок за куском, как его прошёл бы запуск без единого отказа. */
const walkPass = (pass: CatchupPass, position: Date = pass.from) => {
  const slices = [];

  for (
    let slice = nextCatchupSlice(pass, position, config);
    slice !== null;
    slice = nextCatchupSlice(pass, position, config)
  ) {
    slices.push(slice);
    position = slice.endedTo;
  }

  return slices;
};

describe('проход догона', () => {
  it('без прохода начинает новый: неделя назад от текущего момента минус отставание', () => {
    const plan = planCatchupPass({ watermark: null, passFrom: null, passTo: null }, now, config);

    expect(plan.action).toBe('start');
    expect(plan.pass.to.toISOString()).toBe('2026-08-28T11:59:00.000Z');
    expect(plan.pass.from.toISOString()).toBe('2026-08-21T11:59:00.000Z');
  });

  it('строку без границ — ту, что осталась от прогона до миграции, — считает проходом, которого нет', () => {
    const plan = planCatchupPass(
      { watermark: at('2026-08-28T11:00:00.000Z'), passFrom: null, passTo: null },
      now,
      config,
    );

    expect(plan.action).toBe('start');
  });

  it('идущий проход продолжает с позиции и не сдвигает его границ', () => {
    const passFrom = at('2026-08-21T06:00:00.000Z');
    const passTo = at('2026-08-28T06:00:00.000Z');
    const position = at('2026-08-24T06:00:00.000Z');

    const plan = planCatchupPass({ watermark: position, passFrom, passTo }, now, config);

    expect(plan).toEqual({ action: 'continue', pass: { from: passFrom, to: passTo }, position });
  });

  it('пройденный проход ждёт, пока с его конца не пройдёт SYNC_CATCHUP_PASS_EVERY_HOURS', () => {
    const passTo = at('2026-08-28T06:00:00.000Z');

    const plan = planCatchupPass(
      { watermark: passTo, passFrom: at('2026-08-21T06:00:00.000Z'), passTo },
      now,
      config,
    );

    expect(plan.action).toBe('wait');
    expect(plan.action === 'wait' && plan.nextPassAt.toISOString()).toBe('2026-08-29T06:00:00.000Z');
  });

  it('пройденный проход сменяется новым, когда срок вышел', () => {
    const passTo = at('2026-08-27T11:59:00.000Z');

    const plan = planCatchupPass(
      { watermark: passTo, passFrom: at('2026-08-20T11:59:00.000Z'), passTo },
      now,
      config,
    );

    expect(plan.action).toBe('start');
    expect(plan.pass.to.toISOString()).toBe('2026-08-28T11:59:00.000Z');
  });

  it('упавший кусок не сдвигает позицию: следующий запуск продолжает проход, а не ждёт', () => {
    // Позиция осталась там, где была до упавшего куска, — прошло хоть двое суток.
    const passFrom = at('2026-08-19T12:00:00.000Z');
    const passTo = at('2026-08-26T12:00:00.000Z');
    const position = at('2026-08-22T00:00:00.000Z');

    const plan = planCatchupPass({ watermark: position, passFrom, passTo }, now, config);

    expect(plan.action).toBe('continue');
  });
});

describe('куски прохода', () => {
  const pass: CatchupPass = {
    from: at('2026-08-21T11:59:00.000Z'),
    to: at('2026-08-28T11:59:00.000Z'),
  };

  it('первый кусок идёт от начала прохода, без перекрытия', () => {
    const slice = nextCatchupSlice(pass, pass.from, config);

    expect(slice?.endedFrom.toISOString()).toBe('2026-08-21T11:59:00.000Z');
    expect(slice?.endedTo.toISOString()).toBe('2026-08-21T23:59:00.000Z');
  });

  it('следующий начинается на перекрытие раньше конца предыдущего', () => {
    const slice = nextCatchupSlice(pass, at('2026-08-21T23:59:00.000Z'), config);

    expect(slice?.endedFrom.toISOString()).toBe('2026-08-21T23:49:00.000Z');
    expect(slice?.endedTo.toISOString()).toBe('2026-08-22T11:59:00.000Z');
  });

  it('идут строго от старого к новому, стык перекрыт, дыры нет', () => {
    const slices = walkPass(pass);

    // Неделя по двенадцать часов — ровно четырнадцать кусков.
    expect(slices).toHaveLength(14);
    expect(slices[0]?.endedFrom).toEqual(pass.from);
    expect(slices.at(-1)?.endedTo).toEqual(pass.to);

    for (let index = 1; index < slices.length; index += 1) {
      const previous = slices[index - 1];
      const current = slices[index];

      expect(current?.endedTo.getTime()).toBeGreaterThan(previous?.endedTo.getTime() ?? 0);
      expect(current?.endedFrom.getTime()).toBe((previous?.endedTo.getTime() ?? 0) - 10 * MINUTE_MS);
    }
  });

  it('последний кусок короче и упирается в конец прохода', () => {
    const shortPass: CatchupPass = {
      from: at('2026-08-27T00:00:00.000Z'),
      to: at('2026-08-27T17:00:00.000Z'),
    };

    const slices = walkPass(shortPass);

    expect(slices).toHaveLength(2);
    expect(slices[0]?.endedTo.getTime() ?? 0).toBe(shortPass.from.getTime() + 12 * HOUR_MS);
    expect(slices[1]?.endedTo).toEqual(shortPass.to);
  });

  it('с позиции посередине продолжает с того же куска, пройденные не читает заново', () => {
    const position = at('2026-08-24T11:59:00.000Z');

    const slices = walkPass(pass, position);

    expect(slices).toHaveLength(8);
    expect(slices[0]?.endedFrom.toISOString()).toBe('2026-08-24T11:49:00.000Z');
    expect(slices[0]?.endedTo.toISOString()).toBe('2026-08-24T23:59:00.000Z');
  });

  it('пройденный проход кусков не даёт', () => {
    expect(nextCatchupSlice(pass, pass.to, config)).toBeNull();
  });
});
