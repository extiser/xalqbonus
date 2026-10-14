import { describe, expect, it } from 'vitest';

import { isFinalAttempt, isOverdue } from '#server/queues/sync';

/**
 * Пропуск накопившихся задач расписания.
 *
 * Тест существует из-за пойманной ошибки: просроченность считалась от времени постановки
 * задачи, а планировщик BullMQ производит задачу заранее и кладёт её отлежаться
 * с задержкой до слота. `timestamp` у такой задачи всегда на целый интервал старше момента
 * запуска, и отсчёт от постановки объявлял просроченной **каждую** задачу — синхронизация
 * замолкала после первого прогона, а в логе шло ровное «просрочена и пропущена» раз в минуту.
 */

const INTERVAL_MS = 60_000;
const NOW = 1_700_000_000_000;

describe('пропуск просроченных задач синхронизации', () => {
  it('задача, поставленная заранее и дождавшаяся своего слота, просроченной не считается', () => {
    // Ровно то, что кладёт планировщик: произведена интервал назад, слот наступил сейчас.
    const timing = { timestamp: NOW - INTERVAL_MS, delay: INTERVAL_MS };

    expect(isOverdue(timing, INTERVAL_MS, NOW)).toBe(false);
  });

  it('задача, прождавшая свой слот дольше интервала, пропускается', () => {
    // Предыдущий прогон занял три минуты, и эта задача всё это время лежала готовой.
    const timing = { timestamp: NOW - 4 * INTERVAL_MS, delay: INTERVAL_MS };

    expect(isOverdue(timing, INTERVAL_MS, NOW)).toBe(true);
  });

  it('небольшая задержка обработки задачу не убивает', () => {
    const timing = { timestamp: NOW - INTERVAL_MS - 5_000, delay: INTERVAL_MS };

    expect(isOverdue(timing, INTERVAL_MS, NOW)).toBe(false);
  });

  it('задача без задержки считается от постановки', () => {
    // Так выглядит прогон, поставленный руками, а не расписанием.
    expect(isOverdue({ timestamp: NOW - 10_000, delay: 0 }, INTERVAL_MS, NOW)).toBe(false);
    expect(isOverdue({ timestamp: NOW - 2 * INTERVAL_MS, delay: 0 }, INTERVAL_MS, NOW)).toBe(true);
  });
});

/**
 * Повтор ночного перечитывания транзакций и пересчёт денег после итогового исхода.
 *
 * Тест существует из-за пойманной ошибки: перечитывание шло одной попыткой, а деньги дашборда
 * пересчитывались только после его успеха. 12 и 13.10.2026 оно падало на первой странице
 * по лимиту Fleet API — одна неудачная минута, и «Деньги» сутки стояли на прежней цифре.
 */

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

describe('итоговая попытка задачи синхронизации', () => {
  it('отказ, после которого будет повтор, итоговым не считается', () => {
    // BullMQ увеличивает счётчик до события `failed`: после первой попытки он равен единице.
    expect(isFinalAttempt(1, 3)).toBe(false);
    expect(isFinalAttempt(2, 3)).toBe(false);
  });

  it('отказ последней попытки — итоговый', () => {
    expect(isFinalAttempt(3, 3)).toBe(true);
  });

  it('без числа попыток первый же отказ итоговый', () => {
    expect(isFinalAttempt(1, undefined)).toBe(true);
  });
});

describe('повтор перечитывания транзакций', () => {
  // Повтор сохраняет `timestamp` и `opts.delay` задачи: срок у него прежний — слот расписания.
  const slot = NOW;
  const timing = { timestamp: slot - DAY_MS, delay: DAY_MS };

  it('повтор через 30 минут после слота при интервале сутки не просрочен', () => {
    expect(isOverdue(timing, DAY_MS, slot + 30 * MINUTE_MS)).toBe(false);
  });

  it('повтор через 60 минут после слота при интервале сутки не просрочен', () => {
    expect(isOverdue(timing, DAY_MS, slot + 60 * MINUTE_MS)).toBe(false);
  });
});
