import { consola } from 'consola';
import { hasLegacyRecord } from '#server/repositories/legacyDriverMap';
import { countCompletedTripsByPerson } from '#server/repositories/trips';
import { buildWelcomeIdempotencyKey } from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';

/**
 * Приветственный бонус: 300 баллов после пяти завершённых поездок.
 *
 * Живёт внутри начисления за поездку, а не отдельной регулярной задачей. Старый бот
 * споткнулся ровно на этом: его почасовой обход правил баланс чтением-записью параллельно
 * с инкрементом из обхода поездок, и начисления терялись (docs/analysis.md). Второй
 * независимый писатель в баланс здесь не нужен — прогон синхронизации и так держит
 * в руках поездку, человека и журнал.
 *
 * Участие в программе проверяет вызывающий: сюда доходит только тот, кому начислен балл
 * за поездку, а он начисляется лишь участнику со строкой `person_settings`.
 */

const log = consola.withTag('points:welcome-bonus');

/** Сколько баллов обещано. Продуктовое решение парка, унаследованное как есть. */
const WELCOME_BONUS_POINTS = 300;

/** После скольких завершённых поездок бонус положен. */
const WELCOME_TRIPS_REQUIRED = 5;

export type WelcomeBonusInput = {
  personId: string;
  driverAccountId: string;
  emissionAccountId: string;
  /**
   * Время операции — завершение поездки, на которой порог сошёлся: журнал показывает,
   * когда бонус был заработан, а не когда прогон до него добрался.
   */
  occurredAt: Date;
};

/**
 * Выдаёт бонус, если он положен и ещё не выдан. Возвращает `true`, только когда баланс
 * действительно тронут: повтор по ключу — штатный исход, а не выдача.
 *
 * Счета передаются вызывающим, а не читаются заново: начисление за поездку только что
 * держало их в руках, и второй круг запросов на каждую поездку ничего бы не уточнил.
 */
export const awardWelcomeBonus = async (input: WelcomeBonusInput): Promise<boolean> => {
  // Перенесённый из старой базы проверяется первым, и не только потому, что запрос дешевле
  // счёта поездок: таких людей 4 099, и до подсчёта поездок большинству доходить незачем.
  // Само условие обязано стоять в коде, а не подразумеваться: без него перенесённый водитель
  // сделает после выката пять поездок и получит 300 баллов как новичок — до 1.23 млн баллов,
  // и инвариант «журнал равен балансу» этого не покажет, журнал сойдётся с завышенным
  // балансом (docs/decisions.md → «Приветственный бонус — только новым»).
  if (await hasLegacyRecord(input.personId)) {
    return false;
  }

  // Поездки считаются по всем профилям человека, а не по учётке парка: переоформленный
  // в парке водитель иначе начал бы отсчёт заново.
  const completedTrips = await countCompletedTripsByPerson(input.personId, WELCOME_TRIPS_REQUIRED);

  if (completedTrips < WELCOME_TRIPS_REQUIRED) {
    return false;
  }

  // Порог «не меньше пяти», а не «ровно пятая»: в одном окне приезжает и пятая поездка,
  // и шестая, обе записываются до начисления, и на «ровно пятой» такой водитель не получил
  // бы бонус никогда. Повторную выдачу исключает уникальное ограничение на ключ, а не
  // проверка «мы уже начисляли»: при параллельных прогонах полагаться можно только на него
  // (docs/points.md → «Каждая операция идемпотентна»).
  const { applied } = await transferPoints({
    reason: 'welcome',
    idempotencyKey: buildWelcomeIdempotencyKey(input.personId),
    amount: WELCOME_BONUS_POINTS,
    fromAccountId: input.emissionAccountId,
    toAccountId: input.driverAccountId,
    occurredAt: input.occurredAt,
  });

  if (applied) {
    log.info('Приветственный бонус выдан', {
      personId: input.personId,
      amount: WELCOME_BONUS_POINTS,
    });
  }

  return applied;
};
