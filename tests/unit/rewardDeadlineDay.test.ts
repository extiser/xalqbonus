import { describe, expect, it } from 'vitest';

import { rewardDeadlineDay } from '#shared/reward';

/**
 * День «Забрать до» (issue #354). Срок ручной награды и подарка — граница суток после выбранного
 * дня: 00:00 следующего дня по Ташкенту, а у выданных до #352 — 05:00. День самой метки назвал бы
 * следующее число, и служебные экраны так и показывали. Приз акции живёт `now() + N дней`, и его
 * день — день самого срока.
 */
describe('день «Забрать до»', () => {
  // Выбран день 10 октября. Ташкент — UTC+5.
  const MIDNIGHT_BOUNDARY = new Date('2026-10-10T19:00:00Z'); // 11.10, 00:00 по Ташкенту
  const PROMO_BOUNDARY = new Date('2026-10-11T00:00:00Z'); // 11.10, 05:00 по Ташкенту

  it.each(['manual', 'gift'] as const)('%s: срок 00:00 следующего дня — выбранный день', (source) => {
    expect(rewardDeadlineDay(MIDNIGHT_BOUNDARY, source)).toBe('2026-10-10');
  });

  it.each(['manual', 'gift'] as const)('%s: срок 05:00 следующего дня, до #352, — выбранный день', (source) => {
    expect(rewardDeadlineDay(PROMO_BOUNDARY, source)).toBe('2026-10-10');
  });

  it('campaign: день самого срока', () => {
    expect(rewardDeadlineDay(MIDNIGHT_BOUNDARY, 'campaign')).toBe('2026-10-11');
    expect(rewardDeadlineDay(PROMO_BOUNDARY, 'campaign')).toBe('2026-10-11');
    // 17.10, 14:32 по Ташкенту.
    expect(rewardDeadlineDay(new Date('2026-10-17T09:32:00Z'), 'campaign')).toBe('2026-10-17');
  });
});
