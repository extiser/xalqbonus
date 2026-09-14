import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { readDriverCard } from '#server/services/drivers/readDriverCard';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import {
  cleanupTestEmployees,
  createClosedTestLink,
  createTestEmployee,
  linkTestDriver,
  nextTestTelegramUserId,
} from '../support/employees';

/**
 * Карточка водителя с привязками Telegram.
 *
 * Запрос привязок сырой, и типы расхождения с базой не ловят: карточка три дня отвечала 500
 * на колонке, удалённой миграцией `#84`, и заметили это на стенде (`#129`). Тест читает
 * карточку целиком через сервис — ровно тем путём, которым её читает ручка.
 */

describe('карточка водителя', () => {
  afterEach(async () => {
    // Привязки ссылаются на человека и на сотрудника — уходят первыми.
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('показывает действующую привязку первой, а у закрытой — имя сотрудника', async () => {
    const { personId } = await createTestPerson({ inProgram: true });
    const { employeeId } = await createTestEmployee({ role: 'manager' });

    const closedChatId = nextTestTelegramUserId();
    const activeChatId = nextTestTelegramUserId();

    await createClosedTestLink({
      personId,
      telegramChatId: closedChatId,
      linkedAt: new Date('2026-09-01T09:00:00.000Z'),
      closedAt: new Date('2026-09-10T12:00:00.000Z'),
      operatorEmployeeId: employeeId,
    });
    await linkTestDriver(personId, activeChatId);

    const card = await readDriverCard(personId);

    expect(card).not.toBeNull();
    expect(card?.telegramLinks).toEqual([
      expect.objectContaining({
        telegramChatId: activeChatId.toString(),
        closedAt: null,
        confirmedBy: 'phone_auto',
        operatorName: null,
      }),
      expect.objectContaining({
        telegramChatId: closedChatId.toString(),
        closedAt: '2026-09-10T12:00:00.000Z',
        closeReason: 'operator',
        confirmedBy: 'operator',
        operatorName: 'Тестовый Сотрудник',
      }),
    ]);
  });
});
