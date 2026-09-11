import { consola } from 'consola';

import { readBotToken } from '#server/bot/config';
import { checkInitData } from '#server/utils/telegramInitData';

/**
 * РАЗВЕДКА issue #81. В `main` не уезжает — снимается вместе со страницей-заглушкой.
 *
 * Ручка нужна ровно для одного: увидеть, что в действительности приезжает на сервер,
 * когда Mini App открыт живым Telegram, и сходится ли подпись, посчитанная нашим кодом,
 * с той, что прислал клиент. Всё, что она делает, — пишет пришедшее в лог и возвращает
 * своё заключение странице: на телефоне консоли нет, и результат виден только на экране.
 *
 * Наблюдения клиента (`note`) идут в тот же лог намеренно: иначе сторона браузера,
 * сторона сервера и сторона бота лежат в трёх разных местах, и сопоставлять их по времени
 * приходится глазами.
 */

const log = consola.withTag('probe:miniapp');

type ProbeRequest = {
  initData?: unknown;
  note?: unknown;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<ProbeRequest>(event);
  const initData = typeof body.initData === 'string' ? body.initData : '';
  const note = typeof body.note === 'string' ? body.note : '';

  // Строка целиком и дословно: расхождение с тем, что посчитал наш код, разбирается только
  // по сырому виду — какие поля пришли, в каком порядке и как закодированы.
  log.info('пришло от Mini App', {
    note,
    initDataRaw: initData,
    fieldNames: [...new URLSearchParams(initData).keys()].sort(),
  });

  const token = readBotToken();

  if (token === '') {
    log.warn('на машине нет TG_BOT_TOKEN: подпись сверять нечем');

    return { verdict: 'токена бота на машине нет — сверять нечем' };
  }

  const result = checkInitData({ initData, token });

  log.info('заключение по подписи', result);

  return {
    verdict: result.outcome,
    // `bigint` в JSON не сериализуется вовсе — `JSON.stringify` на нём бросает исключение,
    // поэтому личность пересобирается с идентификатором строкой, а не отдаётся как есть.
    user:
      result.outcome === 'valid'
        ? { ...result.user, id: result.user.id.toString() }
        : null,
    authDate: 'authDate' in result ? result.authDate.toISOString() : null,
    ageSeconds: 'ageSeconds' in result ? result.ageSeconds : null,
    queryId: result.outcome === 'valid' ? result.queryId : null,
    fieldNames: [...new URLSearchParams(initData).keys()].sort(),
  };
});
