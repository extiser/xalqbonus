import { consola } from 'consola';

import { readAdPromoCode } from '#server/services/candidates/adLaunch';
import { recordMiniAppTouchPress } from '#server/services/promo/recordPromoTouch';
import type { TelegramLaunch } from '#server/utils/telegramInitData';

const log = consola.withTag('promo:miniapp');

/**
 * «Нажал кнопку» (issue #484): первое за запуск нажатие кнопки отправки заявки — на лендинге
 * и на экране по умолчанию — в строку касания запуска. Шаг воронки «Нажали кнопку» один для всех
 * меток со входом «Приложение» (docs/decisions.md → «Лендинги в „Промо“»).
 *
 * Метки рекламы в `start_param` нет — не пишется ничего. Ошибка наружу не идёт: приложение ответа
 * не ждёт, и потерянное нажатие — только дыра в цифрах воронки.
 */
export const recordApplicationPress = async (launch: TelegramLaunch): Promise<void> => {
  try {
    if ((await readAdPromoCode(launch.startParam)) === null) {
      return;
    }
  } catch (error) {
    log.error('метка нажатия кнопки заявки не прочитана', {
      telegramUserId: launch.user.id.toString(),
      error: error instanceof Error ? error.message : String(error),
    });

    return;
  }

  await recordMiniAppTouchPress(launch);
};
