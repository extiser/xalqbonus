import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { readMemberScreen } from '#server/services/drivers/readMemberScreen';
import type { MiniAppStateResponse } from '#shared/types/miniapp';
import {
  cleanupTestData,
  createTestPerson,
  disconnectDatabase,
  insertSucceededSyncRun,
  resetOrdersSyncState,
} from '../support/database';

/**
 * Отметка «поездки учтены до» на экране участника.
 *
 * Строка два дня показывала «19:26» двухдневной давности без признака, что время
 * не сегодняшнее (issue #133); теперь дата пишется всегда и перед временем (issue #142). Тест читает экран через сервис — ровно тем путём, которым
 * его читает ручка, — и заодно прогоняет сырой запрос последнего прогона в настоящую базу.
 *
 * «Сейчас» — 14.09.2026 10:43 по Ташкенту, тот самый момент со стенда.
 */

const NOW = new Date('2026-09-14T05:43:00.000Z');

const HOUR_MS = 60 * 60 * 1_000;

const readNote = async (
  finishedAt: Date,
  language: 'ru' | 'uz',
): Promise<Extract<MiniAppStateResponse, { screen: 'member' }>['tripsNote']> => {
  const { personId } = await createTestPerson({ inProgram: true });

  await insertSucceededSyncRun('orders', new Date(finishedAt.getTime() - 60_000), finishedAt);

  const screen = await readMemberScreen(
    { personId, name: 'Тест', points: 0n, language },
    NOW,
  );

  if (screen.screen !== 'member') {
    throw new Error('ожидался экран участника');
  }

  return screen.tripsNote;
};

describe('отметка поездок на экране участника', () => {
  afterEach(async () => {
    await resetOrdersSyncState();
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('прогон свежий — дата и время, обычной подписью', async () => {
    // 09:00 по Ташкенту того же дня: даты не опускаем и «сегодня» не пишем.
    const sameDay = new Date('2026-09-14T04:00:00.000Z');

    expect(await readNote(sameDay, 'ru')).toEqual({
      text: 'Поездки учтены до 14.09.2026, 09:00',
      stale: false,
    });

    await resetOrdersSyncState();

    // Вчера 19:26 — пятнадцать часов назад: полная дата вместо «вчера», не предупреждение.
    const lastEvening = new Date('2026-09-13T14:26:00.000Z');

    expect(await readNote(lastEvening, 'uz')).toEqual({
      text: 'Safarlar 13.09.2026 soat 19:26 gacha hisobga olingan',
      stale: false,
    });
  });

  it('прогон старше суток — та же строка, но с предупреждением', async () => {
    // Вчера 09:43 — больше суток назад: день всё ещё вчерашний, но строка уже предупреждение.
    expect(await readNote(new Date(NOW.getTime() - 25 * HOUR_MS), 'ru')).toEqual({
      text: 'Поездки учтены до 13.09.2026, 09:43',
      stale: true,
    });

    await resetOrdersSyncState();

    const twoDaysAgo = new Date('2026-09-12T14:26:00.000Z');

    expect(await readNote(twoDaysAgo, 'ru')).toEqual({
      text: 'Поездки учтены до 12.09.2026, 19:26',
      stale: true,
    });

    await resetOrdersSyncState();

    expect(await readNote(twoDaysAgo, 'uz')).toEqual({
      text: 'Safarlar 12.09.2026 soat 19:26 gacha hisobga olingan',
      stale: true,
    });
  });

  it('успешных прогонов нет — строки нет', async () => {
    const { personId } = await createTestPerson({ inProgram: true });

    const screen = await readMemberScreen(
      { personId, name: 'Тест', points: 0n, language: 'ru' },
      NOW,
    );

    expect(screen.screen === 'member' && screen.tripsNote).toBeNull();
  });
});
