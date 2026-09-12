import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  hasSignedInitData,
  loadTelegramWebApp,
  type TelegramWebApp,
} from '../../app/composables/useTelegramWebApp';

/**
 * Разбор адреса, которым Telegram передаёт личность в Mini App.
 *
 * Тест того же рода, что проверка подписи: интерфейс тестами не покрывается
 * (docs/infra.md → «Тесты»), но здесь решается, доедет ли до сервера личность вообще —
 * и сломалось это молча, отказом у всех сразу и без единой записи в логе (issue #90).
 *
 * Чего файл **не** доказывает: что SDK Telegram читает хеш именно так. Свой разбор хеша
 * мы не заводим — это чужой протокол, который пришлось бы догонять на каждой версии
 * Bot API, — и `readHashParameter` здесь модель прочитанного прогоном поведения, живущая
 * в тесте и только в нём.
 *
 * Что файл доказывает: строка, пришедшая в хеше в том виде, в каком её кладёт Telegram,
 * содержит подпись и момент выписки — а она же, после того как её тронул роутер,
 * не содержит ни того, ни другого, и признак `hasSignedInitData` эти два случая
 * различает.
 */

/**
 * Хеш в том виде, в каком его кладёт Telegram: разделители внутри `tgWebAppData`
 * закодированы — `%3D` вместо `=` и `%26` вместо `&`, — иначе `&` разорвал бы подписанную
 * строку на части. Значения вымышленные, `hash` поэтому ничего не подписывает: здесь
 * проверяется дорога строки, а не её подпись.
 */
const TELEGRAM_HASH =
  '#tgWebAppData=query_id%3DAAF3n0YQAgAAAHefRhBGkcZY' +
  '%26user%3D%257B%2522id%2522%253A765432109%252C%2522first_name%2522%253A%2522Rustam%2522%257D' +
  '%26auth_date%3D1789126043' +
  '%26hash%3Dc1f0a2b93e47d85c6fa1b3d20e79c48f5b6a0d31e2c874f9ab35d6e0c17f2a84' +
  '&tgWebAppVersion=9.6&tgWebAppPlatform=tdesktop&tgWebAppThemeParams=%7B%7D';

/**
 * Тот же хеш после того, как Vue Router нормализовал адрес при инициализации приложения.
 *
 * Снято прогоном 12-09-2026, а не выведено из исходников роутера: открытая в обычном
 * браузере страница `/app#tgWebAppData=a%3D1%26b%3D2` показывает в `location.hash`
 * строку `#tgWebAppData=a=1&b=2`. Раскодированные разделители перестают принадлежать
 * `tgWebAppData` и становятся разделителями самого хеша.
 */
const normalizeLikeRouter = (hash: string): string => hash.replaceAll('%3D', '=').replaceAll('%26', '&');

/**
 * Как SDK достаёт из хеша своё поле.
 *
 * Модель, живущая в тесте: в приложении хеш разбирает сам SDK, и своего разбора мы
 * не заводим. Повторяется здесь именно его `urlParseQueryString` — пара режется
 * `split('=')`, и значением становится **второй** кусок. От `URLSearchParams`, который
 * делит по первому `=` и остаток оставляет в значении, это отличается ровно на ту
 * поломку, которую тест и показывает: у нетронутого хеша разницы нет, у раскодированного
 * от подписанной строки остаётся первое слово.
 */
const readHashParameter = (hash: string, name: string): string => {
  for (const pair of hash.replace(/^#/, '').split('&')) {
    const parts = pair.split('=');

    if (parts[0] === name) {
      return parts[1] === undefined ? '' : decodeURIComponent(parts[1]);
    }
  }

  return '';
};

describe('строка с личностью в хеше адреса', () => {
  it('доезжает целой, пока хеш не тронут', () => {
    const initData = readHashParameter(TELEGRAM_HASH, 'tgWebAppData');

    expect(initData).toContain('auth_date=1789126043');
    expect(initData).toContain(
      'hash=c1f0a2b93e47d85c6fa1b3d20e79c48f5b6a0d31e2c874f9ab35d6e0c17f2a84',
    );
    // Ровно эту строку страница отправляет заголовком, и ровно её проверяет подписью
    // сервер: поля `hash` и `auth_date` на месте, значит проверять есть что.
    expect(hasSignedInitData(initData)).toBe(true);
  });

  it('рвётся по первому `=`, если хеш нормализован роутером', () => {
    const initData = readHashParameter(normalizeLikeRouter(TELEGRAM_HASH), 'tgWebAppData');

    // Восемь символов вместо подписанной строки: `%3D` стал обычным `=`, и значением
    // `tgWebAppData` оказалось имя первого поля. Всё остальное, вместе с подписью,
    // раскодированный `%26` развёл по отдельным полям хеша.
    expect(initData).toBe('query_id');
    expect(hasSignedInitData(initData)).toBe(false);
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
