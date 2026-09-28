import { consola } from 'consola';
import { readSyncState, startCatchupPass } from '#server/repositories/syncState';
import {
  nextCatchupSlice,
  planCatchupPass,
  type CatchupPass,
} from '#server/services/sync/buildOrdersWindow';
import { readSyncConfig, staleWatermarkThresholdMs } from '#server/services/sync/config';
import {
  runOrdersWindow,
  type OrdersSyncSummary,
  type RunOrdersSyncOptions,
} from '#server/services/sync/syncOrders';

/**
 * Запуск догоняющего прогона: проход кусками от старых к новым.
 *
 * Как устроены проход, куски и позиция — `buildOrdersWindow.ts`. Здесь — порядок действий:
 * решить, начинать ли проход, и идти кусками от позиции, пока они не кончатся или один
 * не упадёт. Каждый кусок — обычный прогон заказов со своей строкой `sync_runs`, и его
 * успех двигает позицию сразу, а не в конце прохода: отказ по лимиту на десятом куске
 * не отменяет девяти пройденных.
 *
 * Упавший кусок пробрасывает отказ наверх, и запуск на нём заканчивается. Следующий запуск
 * расписания продолжит с этого же куска — позиция стоит на его начале.
 */

const log = consola.withTag('sync:orders_catchup');

const KIND = 'orders_catchup';

export type OrdersCatchupSummary = {
  /** `waiting` — проход пройден, новому рано; `passed` — запуск дошёл до конца прохода. */
  status: 'waiting' | 'passed';
  pass: CatchupPass;
  /** Куски, пройденные этим запуском. Пусто у `waiting`. */
  slices: OrdersSyncSummary[];
};

export const runOrdersCatchup = async (
  options: RunOrdersSyncOptions = {},
): Promise<OrdersCatchupSummary> => {
  const config = readSyncConfig();
  const now = options.now ?? new Date();
  const state = await readSyncState(KIND);
  const plan = planCatchupPass(
    {
      watermark: state?.watermark ?? null,
      passFrom: state?.passFrom ?? null,
      passTo: state?.passTo ?? null,
    },
    now,
    config,
  );

  if (plan.action === 'wait') {
    log.info('Проход пройден, следующему рано — запросов нет', {
      passFrom: plan.pass.from.toISOString(),
      passTo: plan.pass.to.toISOString(),
      nextPassAt: plan.nextPassAt.toISOString(),
    });

    return { status: 'waiting', pass: plan.pass, slices: [] };
  }

  let position: Date;

  if (plan.action === 'start') {
    await startCatchupPass(plan.pass.from, plan.pass.to);
    position = plan.pass.from;

    log.info('Начат новый проход догона', {
      passFrom: plan.pass.from.toISOString(),
      passTo: plan.pass.to.toISOString(),
    });
  } else {
    position = plan.position;

    // Тревога догона — не расстояние от позиции до «сейчас»: позиция стоит на неделю
    // в прошлом штатно. Тревога — проход, который идёт и не двигается.
    const stuckMs = state ? now.getTime() - state.updatedAt.getTime() : 0;
    const thresholdMs = staleWatermarkThresholdMs(KIND, config);

    if (stuckMs > thresholdMs) {
      log.warn('Позиция прохода догона не двигается — куски падают, а запуски идут', {
        position: position.toISOString(),
        passTo: plan.pass.to.toISOString(),
        stuckMinutes: Math.round(stuckMs / 60_000),
        thresholdMinutes: Math.round(thresholdMs / 60_000),
      });
    }
  }

  const slices: OrdersSyncSummary[] = [];

  for (
    let slice = nextCatchupSlice(plan.pass, position, config);
    slice !== null;
    slice = nextCatchupSlice(plan.pass, position, config)
  ) {
    // Отказ куска летит наверх отсюда же: строка прогона закрыта как `failed`,
    // позиция стоит на его начале, и следующий запуск повторит его.
    // Время записи у каждого куска своё: кусок — отдельный прогон, и проход может идти час.
    const summary = await runOrdersWindow(KIND, slice, config, {
      client: options.client,
      now: options.now ?? new Date(),
    });

    slices.push(summary);
    position = slice.endedTo;
  }

  log.info('Проход догона пройден', {
    passFrom: plan.pass.from.toISOString(),
    passTo: plan.pass.to.toISOString(),
    slicesThisRun: slices.length,
  });

  return { status: 'passed', pass: plan.pass, slices };
};
