import { createHmac } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createEvent, type H3Event } from 'h3';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readOldEngineApplication } from '#server/services/candidates/readOldEngineApplication';
import { requireTelegramLaunch } from '#server/utils/telegramAuth';
import { INIT_DATA_HEADER } from '#shared/types/miniapp';
import { cleanupTestCandidateApplications, insertTestCandidateApplication } from '../support/candidates';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import {
  cleanupTestEmployees,
  createTestEmployee,
  linkTestDriver,
  nextTestPhone,
  nextTestTelegramUserId,
} from '../support/employees';
import { cleanupTestPromoTouches, createTestPromoLink, nextTestPromoCode } from '../support/promo';

/**
 * Экран заявки на старом движке (issue #460) — доставка личности (docs/infra.md → «Тесты»):
 * поле `application` ответа `POST /api/miniapp/device` от подписанной строки до экрана.
 *
 * Экран заявки решает, увидит ли человек форму вместо «обновите», и уходит он только при годной
 * подписанной строке и старом движке. Строка разбирается тем же `requireTelegramLaunch`, что
 * у ручки, экран собирается `readOldEngineApplication` — через `readApplicationScreen`, общую
 * с `GET /api/miniapp/me`. Ручка между ними только передаёт итог.
 *
 * Подпись собирается здесь своим кодом, как в `telegramAuth.test.ts`. Имя бота для ссылки
 * «Написать менеджеру» положено в кэш заранее: в Telegram тест не ходит.
 */

const TOKEN = '1234567890:AAFakeTokenForTestsOnly-xxxxxxxxxxxxxxx';
const OTHER_TOKEN = '9876543210:AAAnotherFakeTokenForTests-yyyyyyyyyyy';
const BOT_USERNAME = 'test_candidates_bot';

/** 10-10-2026, полдень по Ташкенту. */
const NOW = new Date('2026-10-10T07:00:00.000Z');

const signInitData = (fields: Record<string, string>, token: string): string => {
  const parameters = new URLSearchParams(fields);
  const dataCheckString = [...parameters.entries()]
    .sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();

  parameters.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));

  return parameters.toString();
};

const eventWithInitData = (initData: string): H3Event => {
  const request = new IncomingMessage(new Socket());

  request.headers = { [INIT_DATA_HEADER]: initData };

  return createEvent(request, new ServerResponse(request));
};

type LaunchInput = { telegramUserId: bigint; startParam: string | null; languageCode: string; token?: string };

/** Подписанная строка, как её шлёт скрипт проверки движка. */
const launchInitData = (input: LaunchInput): string => {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000) - 60),
    user: JSON.stringify({
      id: Number(input.telegramUserId),
      first_name: 'Азиз',
      language_code: input.languageCode,
      allows_write_to_pm: false,
    }),
  };

  if (input.startParam !== null) {
    fields.start_param = input.startParam;
  }

  return signInitData(fields, input.token ?? TOKEN);
};

/** Путь ручки: строка → личность → экран заявки. */
const deviceApplication = async (initData: string, engineOk: boolean) =>
  readOldEngineApplication({
    launch: requireTelegramLaunch(eventWithInitData(initData)),
    engineOk,
    offices: [],
    now: NOW,
  });

const createAdCode = async (): Promise<string> => {
  const code = nextTestPromoCode();

  await createTestPromoLink(code, NOW, 'telegram_ad');

  return code;
};

const globalForIdentity = globalThis as typeof globalThis & { botUsernameByToken?: Map<string, string> };

describe('экран заявки на старом движке', () => {
  beforeEach(() => {
    vi.stubEnv('TG_BOT_TOKEN', TOKEN);
    globalForIdentity.botUsernameByToken ??= new Map<string, string>();
    globalForIdentity.botUsernameByToken.set(TOKEN, BOT_USERNAME);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupTestCandidateApplications();
    await cleanupTestPromoTouches();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('ссылка рекламы в Telegram и старый движок — экран заявки, язык по Telegram', async () => {
    const code = await createAdCode();
    const initData = launchInitData({ telegramUserId: nextTestTelegramUserId(), startParam: code, languageCode: 'uz' });

    const application = await deviceApplication(initData, false);

    expect(application).toMatchObject({
      kind: 'form',
      language: 'uz',
      offices: [],
      managerChatUrl: `https://t.me/${BOT_USERNAME}`,
    });
    expect(application?.texts.ru.send).toBe('Отправить заявку');
    expect(application?.texts.uz.send).toBe('Ariza yuborish');
  });

  it('новый движок — без экрана заявки', async () => {
    const code = await createAdCode();
    const initData = launchInitData({ telegramUserId: nextTestTelegramUserId(), startParam: code, languageCode: 'ru' });

    expect(await deviceApplication(initData, true)).toBeNull();
  });

  it('строка, подписанная чужим токеном, — отказ до экрана', async () => {
    const code = await createAdCode();
    const initData = launchInitData({
      telegramUserId: nextTestTelegramUserId(),
      startParam: code,
      languageCode: 'ru',
      token: OTHER_TOKEN,
    });

    await expect(deviceApplication(initData, false)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('метка, дописанная к подписанной строке, — отказ, а не экран заявки', async () => {
    const code = await createAdCode();
    const initData = `${launchInitData({ telegramUserId: nextTestTelegramUserId(), startParam: null, languageCode: 'ru' })}&start_param=${code}`;

    await expect(deviceApplication(initData, false)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('метка другого носителя или без метки — «обновите»', async () => {
    const poster = nextTestPromoCode();

    await createTestPromoLink(poster, NOW);

    expect(
      await deviceApplication(launchInitData({ telegramUserId: nextTestTelegramUserId(), startParam: poster, languageCode: 'ru' }), false),
    ).toBeNull();
    expect(
      await deviceApplication(launchInitData({ telegramUserId: nextTestTelegramUserId(), startParam: null, languageCode: 'ru' }), false),
    ).toBeNull();
  });

  it('открытая заявка — «уже отправлена» с языком заявки и днём словом, и без метки', async () => {
    const code = await createAdCode();
    const telegramUserId = nextTestTelegramUserId();
    const phone = nextTestPhone();

    // 8-10-2026, 23:30 по Ташкенту — два дня назад, а не вчера: сутки режутся по Ташкенту.
    await insertTestCandidateApplication({
      telegramUserId,
      promoCode: code,
      phoneE164: phone,
      language: 'ru',
      writeAllowed: false,
      createdAt: new Date('2026-10-08T18:30:00.000Z'),
    });

    const application = await deviceApplication(launchInitData({ telegramUserId, startParam: null, languageCode: 'uz' }), false);

    expect(application).toMatchObject({
      kind: 'sent',
      language: 'ru',
      name: 'Азиз',
      writeAllowed: false,
      submittedAtText: { ru: '8 октября', uz: '8-oktabrda' },
    });
  });

  it('день заявки — «сегодня» и «вчера» по Ташкенту', async () => {
    const code = await createAdCode();
    const today = nextTestTelegramUserId();
    const yesterday = nextTestTelegramUserId();

    // 10-10-2026, 00:30 по Ташкенту — по UTC это ещё 9-е.
    await insertTestCandidateApplication({
      telegramUserId: today,
      promoCode: code,
      phoneE164: nextTestPhone(),
      language: 'uz',
      writeAllowed: true,
      createdAt: new Date('2026-10-09T19:30:00.000Z'),
    });
    await insertTestCandidateApplication({
      telegramUserId: yesterday,
      promoCode: code,
      phoneE164: nextTestPhone(),
      language: 'ru',
      writeAllowed: true,
      createdAt: new Date('2026-10-09T18:30:00.000Z'),
    });

    expect(
      await deviceApplication(launchInitData({ telegramUserId: today, startParam: code, languageCode: 'ru' }), false),
    ).toMatchObject({ kind: 'sent', submittedAtText: { ru: 'сегодня', uz: 'bugun' } });
    expect(
      await deviceApplication(launchInitData({ telegramUserId: yesterday, startParam: code, languageCode: 'ru' }), false),
    ).toMatchObject({ kind: 'sent', submittedAtText: { ru: 'вчера', uz: 'kecha' } });
  });

  it('участник по ссылке рекламы — без экрана заявки', async () => {
    const code = await createAdCode();
    const telegramUserId = nextTestTelegramUserId();
    const driver = await createTestPerson({ inProgram: true });

    await linkTestDriver(driver.personId, telegramUserId, telegramUserId);

    expect(
      await deviceApplication(launchInitData({ telegramUserId, startParam: code, languageCode: 'ru' }), false),
    ).toBeNull();
  });

  it('сотрудник по ссылке рекламы — без экрана заявки', async () => {
    const code = await createAdCode();
    const employee = await createTestEmployee({ role: 'manager' });

    expect(employee.telegramUserId).not.toBeNull();
    expect(
      await deviceApplication(
        launchInitData({ telegramUserId: employee.telegramUserId ?? 0n, startParam: code, languageCode: 'ru' }),
        false,
      ),
    ).toBeNull();
  });
});
