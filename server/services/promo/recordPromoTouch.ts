import { consola } from 'consola';

import {
  insertMiniAppPromoTouch,
  insertPromoTouch,
  type PromoTouchInput,
  type PromoTouchRow,
} from '#server/repositories/promo';
import type { TelegramLaunch } from '#server/utils/telegramInitData';
import { readPromoCode } from '#shared/promoLinks';

/**
 * Запись перехода по промо-метке (issue #377): строка на каждое касание.
 *
 * Пишется каждое касание, а не первое, и касание участника программы тоже — с признаком,
 * что он уже был участником. Справочника меток пока нет —
 * код пишется как пришёл.
 */
export const recordPromoTouch = async (touch: PromoTouchInput): Promise<PromoTouchRow> =>
  insertPromoTouch(touch);

const log = consola.withTag('promo:miniapp');

/**
 * Переход по метке из Mini App (issue #456): приложение открыто ссылкой `?startapp=<код>`, код —
 * в `start_param` подписанной `initData`. Кода метки нет — ничего не пишется.
 *
 * Строка одна на запуск, а не на запрос: зовут её ручки, которые приложение дёргает на каждом
 * открытии и перечитывании, а повтор того же запуска отбивает индекс. Воронка метки считает
 * по `telegram_user_id` и касания из Mini App берёт в «Перешли» сама.
 *
 * Ошибка записи наружу не идёт — строка в лог: касание не должно ронять экран, а потерянное
 * касание — только дыра в цифрах воронки.
 */
export const recordMiniAppPromoTouch = async ({ user, startParam, authDate }: TelegramLaunch): Promise<void> => {
  const code = readPromoCode(startParam ?? '');

  if (code === null) {
    return;
  }

  try {
    const touch = await insertMiniAppPromoTouch({
      code,
      telegramUserId: user.id,
      // Чата в приложении нет: в личной переписке он равен `user.id`.
      telegramChatId: user.id,
      launchedAt: authDate,
    });

    if (touch !== null) {
      log.info('переход по промо-метке из Mini App', {
        code,
        telegramUserId: user.id.toString(),
        participant: touch.wasParticipant,
      });
    }
  } catch (error) {
    log.error('переход по промо-метке из Mini App не записан', {
      code,
      telegramUserId: user.id.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
