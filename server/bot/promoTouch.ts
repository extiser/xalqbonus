import { consola } from 'consola';
import type { Bot } from 'grammy';

import { readPromoCode } from '#shared/promoLinks';
import { recordPromoTouch } from '#server/services/promo/recordPromoTouch';

/**
 * Переход по промо-метке в боте (issue #377): `/start p_<код>` — строка в `promo_touches`.
 *
 * Ответа своего у обработчика нет: касание не меняет ответа бота ничем, и апдейт **всегда**
 * уходит дальше (`next()`) — водитель получает то же приветствие с кнопкой запуска, что
 * и без метки. Поэтому регистрируется перед приветствием, после ссылок `demo_` и `emp_`:
 * их обработчики апдейт дальше не пускают, и касание у них не пишется.
 *
 * Ошибка записи ответа не роняет: строка в лог, приветствие уходит. Потерянное касание —
 * дыра в цифрах воронки, молчание бота — водитель, не понявший, куда он попал.
 */

const log = consola.withTag('bot:promo');

/** Причина отказа для строки лога. */
const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const registerPromoTouchHandlers = (bot: Bot): void => {
  bot.command('start', async (context, next) => {
    const code = readPromoCode(context.match ?? '');

    if (code !== null && context.from !== undefined && context.chat !== undefined) {
      const chatId = context.chat.id.toString();

      try {
        const touch = await recordPromoTouch({
          code,
          telegramUserId: BigInt(context.from.id),
          telegramChatId: BigInt(context.chat.id),
        });

        log.info('переход по промо-метке', { code, chatId, participant: touch.wasParticipant });
      } catch (error) {
        log.error('переход по промо-метке не записан', { code, chatId, error: reasonOf(error) });
      }
    }

    await next();
  });
};
