import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  hasSignedInitData,
  loadTelegramWebApp,
  type TelegramWebApp,
} from '../../app/composables/useTelegramWebApp';

/**
 * Признак личности на клиенте и объект Telegram в странице.
 *
 * Тест того же рода, что проверка подписи: интерфейс тестами не покрывается
 * (docs/infra.md → «Тесты»), но здесь решается, доедет ли до сервера личность вообще —
 * и сломалось это молча, отказом у всех сразу и без единой записи в логе (issue #90).
 *
 * Чего файл **не** проверяет: как SDK Telegram разбирает хеш адреса. Это чужой код,
 * и повторённый здесь он проверял бы сам себя — своего разбора хеша у нас нет
 * и не заводится.
 */

describe('hasSignedInitData', () => {
  it('не признаёт личностью огрызок, который оставляет от строки роутер', () => {
    // Ровно эта строка приезжала на сервер 12-09-2026 с боевой машины, и именно она
    // отвечала `401` у всех разом. Vue Router раскодировал хеш, `%3D` стал обычным `=`,
    // и значением `tgWebAppData` оказалось имя первого поля подписанной строки —
    // восемь символов вместо личности.
    expect(hasSignedInitData('query_id')).toBe(false);
  });

  it('признаёт строку, в которой есть подпись и момент выписки', () => {
    // Состав полей взят из живого прогона `#81` (docs/miniapp.md), значения вымышленные:
    // подпись здесь не проверяется — её сверяет сервер токеном бота.
    expect(
      hasSignedInitData(
        'query_id=AAF3n0YQAgAAAHefRhBGkcZY&user=%7B%22id%22%3A765432109%7D' +
          '&auth_date=1789126043' +
          '&hash=c1f0a2b93e47d85c6fa1b3d20e79c48f5b6a0d31e2c874f9ab35d6e0c17f2a84',
      ),
    ).toBe(true);
  });

  it('без `hash` и `auth_date` личностью не считается', () => {
    // Страница, открытая в обычном браузере: объект SDK есть, строки от Telegram нет.
    expect(hasSignedInitData('')).toBe(false);
    // Тот же обычный браузер с проверочным хешем из issue #90.
    expect(hasSignedInitData('a=1&b=2')).toBe(false);
    // Подпись без момента выписки и наоборот — строки такого вида у Telegram не бывает.
    expect(hasSignedInitData('auth_date=1789126043')).toBe(false);
    expect(hasSignedInitData('hash=c1f0a2b9')).toBe(false);
  });
});

describe('loadTelegramWebApp', () => {
  const webApp: TelegramWebApp = {
    initData: 'auth_date=1789126043&hash=c1f0a2b9',
    ready: () => {},
    expand: () => {},
  };

  /** Документ, который умеет сказать, что у него просили создать тег. */
  const spyingDocument = (): { createdTags: string[] } => {
    const createdTags: string[] = [];

    vi.stubGlobal('document', {
      createElement: (tagName: string) => {
        createdTags.push(tagName);

        return { addEventListener: () => {} };
      },
      head: { append: () => {} },
    });

    return { createdTags };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('отдаёт объект, который положил в страницу скрипт из `<head>`', async () => {
    vi.stubGlobal('window', { Telegram: { WebApp: webApp } });
    spyingDocument();

    await expect(loadTelegramWebApp()).resolves.toBe(webApp);
  });

  it('не заводит тег скрипта: объект либо в странице, либо его нет вовсе', async () => {
    // Так выглядит обычный браузер. Второй тег здесь был бы вторым объектом и второй
    // личностью, а прочитал бы он уже испорченный роутером адрес.
    vi.stubGlobal('window', {});
    const { createdTags } = spyingDocument();

    const pending = loadTelegramWebApp();

    // Проверяется до ожидания намеренно: тег создаётся синхронно, и опоздавший объект
    // из него уже ничему не помог бы.
    expect(createdTags).toEqual([]);
    await expect(pending).resolves.toBeNull();
  });

  it('на сервере окна нет вовсе, и личности там взять неоткуда', async () => {
    await expect(loadTelegramWebApp()).resolves.toBeNull();
  });
});
