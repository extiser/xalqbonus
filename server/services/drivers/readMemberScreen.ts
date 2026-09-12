import { formatPoints, plainText } from '#server/bot/texts';
import { hasTripOperations } from '#server/repositories/points';
import { findLastSuccessfulRunFinishedAt } from '#server/repositories/syncRuns';
import { memberScreenTexts } from '#server/services/drivers/memberScreen';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { formatClockTime } from '#server/utils/parkTime';
import type { MiniAppStateResponse } from '#shared/types/miniapp';

/**
 * Экран участника: баланс, имя, отметка свежести данных и обещание бонуса новичку.
 *
 * Истории здесь нет — она приезжает своей ручкой и листается: страница экрана читается
 * один раз, а история догружается кнопкой, и пересобирать ради этого весь экран незачем.
 *
 * Баланс берётся со счёта и нигде не пересчитывается: он производная от журнала,
 * и второе место, которое его считает, — это второй ответ на вопрос «сколько у меня
 * баллов» (docs/points.md).
 */

/**
 * Вид прогона, задающий отметку «данные обновлены».
 *
 * Только `orders`. Добор пропущенного окна (`orders_catchup`) в отметку не входит
 * намеренно: он закрывает дыру в прошлом, а водителю строка обещает, что система дошла
 * до настоящего момента, — это разные утверждения.
 */
const FRESHNESS_KIND = 'orders';

export const readMemberScreen = async (driver: LinkedDriver): Promise<MiniAppStateResponse> => {
  const [hasTrips, syncedAt] = await Promise.all([
    hasTripOperations(driver.personId),
    findLastSuccessfulRunFinishedAt(FRESHNESS_KIND),
  ]);

  return {
    screen: 'member',
    language: driver.language,
    name: driver.name,
    balance: formatPoints(driver.points),
    // Успешных прогонов не было ни одного — строки нет вовсе. Подписать её «неизвестно»
    // значило бы занять место на экране сообщением, которое водителю нечего делать.
    updatedNote:
      syncedAt === null
        ? null
        : plainText('data_updated', driver.language, { time: formatClockTime(syncedAt) }),
    // Обещание первых пяти поездок — тому, у кого в журнале нет ни одной. Не по факту
    // сегодняшней регистрации: перенесённый из старой базы приходит сюда с тысячей
    // поездок за спиной, и обещать ему бонус за первые пять — враньё (issue #101).
    //
    // Без обращения по имени: имя стоит строкой выше, в шапке под балансом.
    promise: hasTrips ? null : plainText('welcome_bonus_promise', driver.language),
    texts: memberScreenTexts(driver.language),
  };
};
