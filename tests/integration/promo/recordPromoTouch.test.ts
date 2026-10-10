import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { recordMiniAppPromoTouch, recordPromoTouch } from '#server/services/promo/recordPromoTouch';
import type { InitDataUser } from '#server/utils/telegramInitData';
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
 * Запись перехода по промо-метке (issue #377) и перехода из Mini App (issue #456).
 *
 * Покрыт сырой запрос вставки — третье исключение docs/infra.md → «Тесты»: человек и признак
 * участника определяются в самом `INSERT`, и расхождение со схемой `telegram_links` typecheck
 * не поймает. Проверяется соответствие схеме и форма строки, через сервис. У касания из Mini App —
 * ещё и `ON CONFLICT` по частичному индексу: строка одна на запуск приложения.
 */

const CODE = 'p_poster1';

afterAll(async () => {
  await disconnectDatabase();
});

describe('запись перехода по промо-метке', () => {
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
        channel: 'bot',
        launchedAt: null,
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

/** Тот, кто открыл приложение, — как его отдаёт проверенная `initData`. */
const launchUser = (telegramUserId: bigint): InitDataUser => ({
  id: telegramUserId,
  firstName: 'Азиз',
  lastName: '',
  username: '',
  languageCode: 'ru',
  allowsWriteToPrivateMessages: false,
});

describe('запись перехода по промо-метке из Mini App', () => {
  const LAUNCH = new Date('2026-10-10T09:00:00.000Z');

  afterEach(async () => {
    await cleanupTestPromoTouches();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  it('повтор того же запуска строки не добавляет', async () => {
    const telegramUserId = nextTestTelegramUserId();
    const launch = { user: launchUser(telegramUserId), startParam: CODE, authDate: LAUNCH };

    await recordMiniAppPromoTouch(launch);
    await recordMiniAppPromoTouch(launch);

    expect(await readTestPromoTouches(telegramUserId)).toEqual([
      {
        code: CODE,
        telegramUserId,
        telegramChatId: telegramUserId,
        personId: null,
        wasParticipant: false,
        channel: 'miniapp',
        launchedAt: LAUNCH,
      },
    ]);
  });

  it('другой запуск — своя строка', async () => {
    const telegramUserId = nextTestTelegramUserId();
    const user = launchUser(telegramUserId);

    await recordMiniAppPromoTouch({ user, startParam: CODE, authDate: LAUNCH });
    await recordMiniAppPromoTouch({ user, startParam: CODE, authDate: new Date(LAUNCH.getTime() + 60_000) });

    expect(await readTestPromoTouches(telegramUserId)).toHaveLength(2);
  });

  it('участник — с человеком живой привязки', async () => {
    const telegramUserId = nextTestTelegramUserId();
    const driver = await createTestPerson({ inProgram: true });

    await linkTestDriver(driver.personId, telegramUserId, telegramUserId);

    await recordMiniAppPromoTouch({ user: launchUser(telegramUserId), startParam: CODE, authDate: LAUNCH });

    expect(await readTestPromoTouches(telegramUserId)).toMatchObject([
      { personId: driver.personId, wasParticipant: true, channel: 'miniapp' },
    ]);
  });

  it('без метки в ссылке — ничего', async () => {
    const telegramUserId = nextTestTelegramUserId();

    await recordMiniAppPromoTouch({ user: launchUser(telegramUserId), startParam: null, authDate: LAUNCH });
    await recordMiniAppPromoTouch({ user: launchUser(telegramUserId), startParam: 'survey_1', authDate: LAUNCH });

    expect(await readTestPromoTouches(telegramUserId)).toEqual([]);
  });
});
