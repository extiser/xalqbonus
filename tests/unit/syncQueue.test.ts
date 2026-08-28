import { describe, expect, it } from 'vitest';

import { isOverdue } from '#server/queues/sync';

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
