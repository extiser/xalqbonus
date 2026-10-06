import type { Language } from '#server/generated/prisma/enums';
import { plainText } from '#server/bot/texts';
import { findLastSuccessfulRunFinishedAt } from '#server/repositories/syncRuns';
import { memberProfileTexts, readMemberProfile } from '#server/services/drivers/memberProfile';
import { memberScreenTexts } from '#server/services/drivers/memberScreen';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { memberOrderTexts } from '#server/services/orders/memberOrderScreen';
import { WELCOME_BONUS_POINTS, WELCOME_TRIPS_REQUIRED } from '#server/services/points/awardWelcomeBonus';
import { readWelcomeBonus } from '#server/services/points/readWelcomeBonus';
import { memberRewardTexts } from '#server/services/rewards/memberRewardScreen';
import { readMemberSurveyBanner } from '#server/services/surveys/readMemberSurveyBanner';
import { DAY_MS, formatCalendarDate, formatClockTime, formatDayMonth } from '#server/utils/parkTime';
import type { MemberWelcomeBonus, MiniAppDemo, MiniAppStateResponse, TripsNote } from '#shared/types/miniapp';

/**
 * Экран участника: баланс, имя с позывным, отметка учтённых поездок и счёт до бонуса новичку.
 *
 * Истории здесь нет — она приезжает своей ручкой и листается: страница экрана читается
 * один раз, а история догружается прокруткой, и пересобирать ради этого весь экран незачем.
 *
 * Баланс берётся со счёта и нигде не пересчитывается: он производная от журнала,
 * и второе место, которое его считает, — это второй ответ на вопрос «сколько у меня
 * баллов» (docs/points.md).
 */

/**
 * Вид прогона, задающий отметку «поездки учтены до».
 *
 * Только `orders`. Добор пропущенного окна (`orders_catchup`) в отметку не входит
 * намеренно: он закрывает дыру в прошлом, а водителю строка обещает, что система дошла
 * до настоящего момента, — это разные утверждения.
 */
const FRESHNESS_KIND = 'orders';

/**
 * Отметка поездок: полная дата и время прогона, при любом его возрасте.
 *
 * Без «сегодня» и «вчера»: «19:26» без даты читается как сегодняшнее время (issue #133),
 * а относительное слово после времени — задом наперёд (issue #142).
 *
 * Предупреждение — по прошедшим суткам, а не по календарю: прогон вчера в 19:26, увиденный
 * сегодня в 10:43, отстаёт на пятнадцать часов и в порядке, а вчерашний в 09:00, увиденный
 * в 10:43, — уже нет.
 */
const tripsNote = (syncedAt: Date, language: Language, now: Date): TripsNote => ({
  text: plainText('trips_counted', language, {
    date: formatCalendarDate(syncedAt),
    time: formatClockTime(syncedAt),
  }),
  stale: now.getTime() - syncedAt.getTime() > DAY_MS,
});

/**
 * Слайд «+300»: счёт, пока бонус положен и не выдан, и праздник «Ура! Бонус зачислен!» после
 * выдачи — пока водитель не нажал «Спасибо» (issue #421): без него о выдаче говорило бы одно
 * уведомление, и слайд исчезал бы в тот миг, когда бонус дали. Нажал «Спасибо» — слайда нет;
 * перенесённому из старой базы бонус не положен.
 */
const memberWelcomeBonus = async (personId: string): Promise<MemberWelcomeBonus | null> => {
  const bonus = await readWelcomeBonus(personId);

  if (bonus?.state === 'progress') {
    return {
      awarded: false,
      done: bonus.done,
      total: bonus.total,
      points: WELCOME_BONUS_POINTS,
      joinedAt: formatDayMonth(bonus.joinedAt),
    };
  }

  if (bonus?.state === 'awarded' && bonus.seenAt === null) {
    return {
      awarded: true,
      done: WELCOME_TRIPS_REQUIRED,
      total: WELCOME_TRIPS_REQUIRED,
      points: WELCOME_BONUS_POINTS,
      joinedAt: formatDayMonth(bonus.joinedAt),
    };
  }

  return null;
};

/**
 * «Сейчас» приходит параметром: от него зависит предупреждение, и тест
 * задаёт его явно, а не ждёт нужного часа.
 *
 * Чат — тот, по которому участник найден: в профиле он стоит как Telegram ID.
 *
 * `demo` — полоса демо-зрителя (issue #205); у всех остальных `null`. Сам экран демо-водителя
 * собирается тем же кодом, что у живого.
 */
export const readMemberScreen = async (
  driver: LinkedDriver,
  telegramChatId: bigint,
  now: Date,
  demo: MiniAppDemo | null = null,
): Promise<MiniAppStateResponse> => {
  const [welcomeBonus, syncedAt, profile, survey] = await Promise.all([
    memberWelcomeBonus(driver.personId),
    findLastSuccessfulRunFinishedAt(FRESHNESS_KIND),
    readMemberProfile(driver.personId, telegramChatId),
    readMemberSurveyBanner(driver, now),
  ]);

  // Успешных прогонов не было ни одного — строка говорит, что данных ещё нет. Пустота
  // здесь не работает: пустое место под балансом читается поломкой (docs/frontend.md →
  // «Пустое место объясняется словами»).
  const notReceived = plainText('trips_not_received', driver.language);

  return {
    screen: 'member',
    language: driver.language,
    name: driver.name,
    callsign: driver.callsign,
    // Баллов у водителя не бывает столько, чтобы число вышло за точность `number`.
    balancePoints: Number(driver.points),
    // Без даты, как в макете главной, и без предупреждения об устаревании: признак живёт
    // в разделе истории, в `tripsNote`.
    updatedNote:
      syncedAt === null
        ? notReceived
        : plainText('balance_updated', driver.language, { time: formatClockTime(syncedAt) }),
    tripsNote: syncedAt === null ? { text: notReceived, stale: false } : tripsNote(syncedAt, driver.language, now),
    welcomeBonus,
    texts: memberScreenTexts(driver.language, welcomeBonus),
    orderTexts: memberOrderTexts(driver.language),
    rewardTexts: memberRewardTexts(driver.language),
    profile,
    profileTexts: memberProfileTexts(driver.language),
    demo,
    survey,
  };
};
