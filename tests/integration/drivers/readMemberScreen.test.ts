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
 * не сегодняшнее (issue #133). Тест читает экран через сервис — ровно тем путём, которым
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

  it('прогон сегодня — время без даты, обычной подписью', async () => {
    // 09:00 по Ташкенту того же дня.
    const finishedAt = new Date('2026-09-14T04:00:00.000Z');

    expect(await readNote(finishedAt, 'ru')).toEqual({
      text: 'Поездки учтены до 09:00',
      stale: false,
    });

    await resetOrdersSyncState();

    expect(await readNote(finishedAt, 'uz')).toEqual({
      text: 'Safarlar soat 09:00 gacha hisobga olingan',
      stale: false,
    });
  });

  it('прогон вчера — со словом «вчера», и предупреждение только после суток', async () => {
    // Вчера 19:26 — пятнадцать часов назад: подпись, не предупреждение.
    const lastEvening = new Date('2026-09-13T14:26:00.000Z');

    expect(await readNote(lastEvening, 'ru')).toEqual({
      text: 'Поездки учтены до 19:26 вчера',
      stale: false,
    });

    await resetOrdersSyncState();

    expect(await readNote(lastEvening, 'uz')).toEqual({
      text: 'Safarlar kecha soat 19:26 gacha hisobga olingan',
      stale: false,
    });

    await resetOrdersSyncState();

    // Вчера 09:00 — больше суток назад: день всё ещё вчерашний, но строка уже предупреждение.
    expect(await readNote(new Date(NOW.getTime() - 25 * HOUR_MS), 'ru')).toEqual({
      text: 'Поездки учтены до 09:43 вчера',
      stale: true,
    });
  });

  it('прогон старше суток — с датой и предупреждением', async () => {
    const twoDaysAgo = new Date('2026-09-12T14:26:00.000Z');

    expect(await readNote(twoDaysAgo, 'ru')).toEqual({
      text: 'Поездки учтены до 19:26 12.09',
      stale: true,
    });

    await resetOrdersSyncState();

    expect(await readNote(twoDaysAgo, 'uz')).toEqual({
      text: 'Safarlar 12.09 soat 19:26 gacha hisobga olingan',
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
