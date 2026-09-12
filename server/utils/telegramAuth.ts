import { consola } from 'consola';
import type { H3Event } from 'h3';

import { readBotToken } from '#server/bot/config';
import { checkInitData, type InitDataUser } from '#server/utils/telegramInitData';
import { INIT_DATA_HEADER } from '#shared/types/miniapp';

/**
 * Вход в приложение со стороны HTTP: достать подписанную строку из запроса, проверить,
 * превратить отказ в ответ.
 *
 * Правил здесь нет — проверка подписи живёт в `server/utils/telegramInitData.ts`. Здесь
 * только то, что знает про HTTP: имя заголовка и коды ответов.
 *
 * Сессии у водителя нет вовсе и не будет: личность приходит от Telegram на **каждом**
 * запросе, подписанная токеном бота (docs/miniapp.md → «Личность приходит от мессенджера»).
 * Своей страницы входа, своего cookie и своего восстановления доступа под четыре тысячи
 * человек не существует, и это не экономия, а отсутствие целого класса дыр.
 */

// Имя заголовка живёт в контракте рядом с типами ответов (`shared/types/miniapp.ts`):
// его знают обе стороны, и разойдясь, они разойдутся молча — запрос просто окажется
// без личности.
export const readInitDataHeader = (event: H3Event): string => getHeader(event, INIT_DATA_HEADER) ?? '';

const log = consola.withTag('miniapp:auth');

/**
 * Кто открыл приложение. Отказ поднимается исключением: до сюда доходят только запросы,
 * которым дальше делать нечего.
 *
 * Ролью это не является и ничего о водителе не говорит: функция отвечает ровно на вопрос
 * «строку подписал Telegram, и в ней вот этот человек». Участник он программы или нет,
 * решает база, а не подпись.
 */
export const requireTelegramUser = (event: H3Event): InitDataUser => {
  const token = readBotToken();

  if (token === '') {
    // Машина без токена бота проверить подпись не может ничем. Отказом в доступе это
    // притворяться не должно: в логе окажутся «неверные подписи» вместо незаполненной
    // переменной (server/utils/telegramInitData.ts).
    throw new Error('проверка initData невозможна: TG_BOT_TOKEN не задан');
  }

  const check = checkInitData({ initData: readInitDataHeader(event), token });

  if (check.outcome !== 'valid') {
    // Причина отказа наружу не уходит: снаружи она ничего не чинит. Внутрь — уходит,
    // и записать её обязательно: снаружи `malformed` и `hash_mismatch` выглядят
    // одинаково, а без записи не различимы и изнутри (issue #90).
    //
    // Сама строка в лог не попадает ни целиком, ни частями: `initData` — действующий
    // пропуск, годный сутки, и в логе он становится ключом ко входу под чужим именем.
    // Пишется исход и, у просроченной, возраст строки в секундах.
    log.info(
      check.outcome === 'expired'
        ? `отказ ${check.outcome}: строке ${check.ageSeconds} с`
        : `отказ ${check.outcome}`,
    );

    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'откройте приложение из Telegram заново',
    });
  }

  return check.user;
};
