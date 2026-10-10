import { createHmac } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createEvent, type H3Event } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireTelegramLaunch } from '#server/utils/telegramAuth';
import { INIT_DATA_HEADER } from '#shared/types/miniapp';

/**
 * Запуск приложения со стороны HTTP — доставка личности (docs/infra.md → «Тесты»): кто открыл
 * приложение, параметр ссылки `?startapp=` и момент открытия (issue #456).
 *
 * Параметр ссылки решает, какой экран увидит человек и чья метка получит касание, а момент
 * открытия — сколько касаний запишется. Оба обязаны браться только из строки с годной подписью:
 * из негодной — отказ, как у `requireTelegramUser`, а не личность и метка на слово клиента.
 *
 * Подпись собирается здесь своим кодом, независимо от проверяемого модуля, — по той же причине,
 * что в `telegramInitData.test.ts`.
 */

const TOKEN = '1234567890:AAFakeTokenForTestsOnly-xxxxxxxxxxxxxxx';
const OTHER_TOKEN = '9876543210:AAAnotherFakeTokenForTests-yyyyyyyyyyy';

const USER_JSON = JSON.stringify({ id: 111222333, first_name: 'Азиз', language_code: 'uz', allows_write_to_pm: true });

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

/** Запрос с подписанной строкой в заголовке — так её шлёт Mini App. */
const eventWithInitData = (initData: string): H3Event => {
  const request = new IncomingMessage(new Socket());

  request.headers = { [INIT_DATA_HEADER]: initData };

  return createEvent(request, new ServerResponse(request));
};

/** Отказ ручки — номер ответа; `null` — функция не отказала. */
const rejection = (event: H3Event): number | null => {
  try {
    requireTelegramLaunch(event);
  } catch (error) {
    return (error as { statusCode?: number }).statusCode ?? null;
  }

  return null;
};

describe('requireTelegramLaunch', () => {
  const authDate = Math.floor(Date.now() / 1000) - 60;

  beforeEach(() => {
    vi.stubEnv('TG_BOT_TOKEN', TOKEN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('отдаёт личность, параметр ссылки и момент открытия из подписанной строки', () => {
    const initData = signInitData(
      { auth_date: String(authDate), start_param: 'p_ad1', user: USER_JSON },
      TOKEN,
    );

    const launch = requireTelegramLaunch(eventWithInitData(initData));

    expect(launch.user.id).toBe(111222333n);
    expect(launch.user.languageCode).toBe('uz');
    expect(launch.startParam).toBe('p_ad1');
    expect(launch.authDate).toEqual(new Date(authDate * 1000));
  });

  it('без параметра ссылки — `null`, а не пустая строка', () => {
    const initData = signInitData({ auth_date: String(authDate), user: USER_JSON }, TOKEN);

    expect(requireTelegramLaunch(eventWithInitData(initData)).startParam).toBeNull();
  });

  it('параметр, дописанный к подписанной строке, — отказ, а не чужая метка', () => {
    const initData = `${signInitData({ auth_date: String(authDate), user: USER_JSON }, TOKEN)}&start_param=p_ad1`;

    expect(rejection(eventWithInitData(initData))).toBe(401);
  });

  it('подменённый момент открытия — отказ: по нему считается касание метки', () => {
    const signed = new URLSearchParams(
      signInitData({ auth_date: String(authDate), start_param: 'p_ad1', user: USER_JSON }, TOKEN),
    );

    signed.set('auth_date', String(authDate + 1));

    expect(rejection(eventWithInitData(signed.toString()))).toBe(401);
  });

  it('строка, подписанная чужим токеном, — отказ', () => {
    const initData = signInitData(
      { auth_date: String(authDate), start_param: 'p_ad1', user: USER_JSON },
      OTHER_TOKEN,
    );

    expect(rejection(eventWithInitData(initData))).toBe(401);
  });

  it('без строки — отказ', () => {
    expect(rejection(eventWithInitData(''))).toBe(401);
  });
});
