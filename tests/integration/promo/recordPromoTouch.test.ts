import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { recordPromoTouch } from '#server/services/promo/recordPromoTouch';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import {
  cleanupTestEmployees,
  createClosedTestLink,
  createTestEmployee,
  linkTestDriver,
  nextTestTelegramUserId,
} from '../support/employees';
import { cleanupTestPromoTouches, readTestPromoTouches } from '../support/promo';

/**
 * Запись перехода по промо-метке (issue #377).
 *
 * Покрыт сырой запрос вставки — третье исключение docs/infra.md → «Тесты»: человек и признак
 * участника определяются в самом `INSERT`, и расхождение со схемой `telegram_links` typecheck
 * не поймает. Проверяется соответствие схеме и форма строки, через сервис.
 */

const CODE = 'p_poster1';

describe('запись перехода по промо-метке', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  afterEach(async () => {
    await cleanupTestPromoTouches();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  it('Telegram без привязки — человека нет, не участник', async () => {
    const telegramUserId = nextTestTelegramUserId();

    const touch = await recordPromoTouch({ code: CODE, telegramUserId, telegramChatId: telegramUserId });

    expect(touch).toEqual({ personId: null, wasParticipant: false });
    expect(await readTestPromoTouches(telegramUserId)).toEqual([
      {
        code: CODE,
        telegramUserId,
        telegramChatId: telegramUserId,
        personId: null,
        wasParticipant: false,
      },
    ]);
  });

  it('с живой привязкой — человек проставлен, участник', async () => {
    const telegramUserId = nextTestTelegramUserId();
    const driver = await createTestPerson({ inProgram: true });

    await linkTestDriver(driver.personId, telegramUserId, telegramUserId);

    await recordPromoTouch({ code: CODE, telegramUserId, telegramChatId: telegramUserId });

    expect(await readTestPromoTouches(telegramUserId)).toMatchObject([
      { personId: driver.personId, wasParticipant: true },
    ]);
  });

  it('только с закрытой привязкой — человека нет, но участник', async () => {
    const telegramUserId = nextTestTelegramUserId();
    const driver = await createTestPerson({ inProgram: true });
    const operator = await createTestEmployee({ role: 'manager' });

    await createClosedTestLink({
      personId: driver.personId,
      telegramChatId: telegramUserId,
      linkedAt: new Date('2026-09-01T00:00:00Z'),
      closedAt: new Date('2026-09-02T00:00:00Z'),
      operatorEmployeeId: operator.employeeId,
    });

    await recordPromoTouch({ code: CODE, telegramUserId, telegramChatId: telegramUserId });

    expect(await readTestPromoTouches(telegramUserId)).toMatchObject([
      { personId: null, wasParticipant: true },
    ]);
  });

  it('привязка без отправителя находится по чату', async () => {
    // Перенесённая из старой базы привязка — один `chat_id`, без `telegram_user_id`. Отправитель
    // касания нарочно другой: найтись строка обязана именно по чату.
    const telegramUserId = nextTestTelegramUserId();
    const telegramChatId = nextTestTelegramUserId();
    const driver = await createTestPerson({ inProgram: true });

    await linkTestDriver(driver.personId, telegramChatId);

    await recordPromoTouch({ code: CODE, telegramUserId, telegramChatId });

    expect(await readTestPromoTouches(telegramUserId)).toMatchObject([
      { telegramChatId, personId: driver.personId, wasParticipant: true },
    ]);
  });

  it('два касания подряд — две строки', async () => {
    const telegramUserId = nextTestTelegramUserId();

    await recordPromoTouch({ code: CODE, telegramUserId, telegramChatId: telegramUserId });
    await recordPromoTouch({ code: CODE, telegramUserId, telegramChatId: telegramUserId });

    expect(await readTestPromoTouches(telegramUserId)).toHaveLength(2);
  });
});
