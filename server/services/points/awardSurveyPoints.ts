import type { Prisma } from '#server/generated/prisma/client';
import { findDriverAccountByPerson } from '#server/repositories/points';
import { findSurvey } from '#server/repositories/surveys';
import { DriverAccountMissingError } from '#server/services/points/errors';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import { buildSurveyIdempotencyKey } from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';
import { UnknownSurveyError } from '#server/services/surveys/errors';

/**
 * Баллы за пройденный опрос (issue #322): сумма опроса, разово на человека и опрос.
 *
 * Зовётся внутри транзакции, которая отмечает опрос пройденным: отметка и баллы обязаны
 * встать вместе. Пройденный опрос без баллов — обещание, которое финал показал, а журнал
 * не выполнил; баллы без отметки — повод пройти опрос ещё раз, и ключ отдал бы «уже начислено»
 * вместо ответов.
 *
 * Уведомления в бот нет: финал опроса сам показывает «+N баллов на балансе».
 */

export type AwardSurveyPointsInput = {
  surveyId: string;
  personId: string;
  /** Время завершения опроса — его журнал и показывает, а не время записи. */
  occurredAt: Date;
  /** Транзакция отметки «опрос пройден». */
  client: Prisma.TransactionClient;
};

export type AwardSurveyPointsResult = {
  /**
   * `true` — баланс тронут сейчас. `false` — либо баллы за этот опрос уже начислены раньше,
   * либо опрос без награды. Различает их `points`.
   */
  applied: boolean;
  /**
   * Сколько баллов человек получил за этот опрос — сейчас или раньше. Ноль — опрос
   * без награды. Повторное нажатие на финале получает ту же сумму, что и первое.
   */
  points: number;
};

export const awardSurveyPoints = async (
  input: AwardSurveyPointsInput,
): Promise<AwardSurveyPointsResult> => {
  // Сумма читается на момент вызова и той же транзакцией. У замороженного опроса она уже
  // не меняется: после запуска рассылки правятся только название и дата окончания.
  const survey = await findSurvey(input.surveyId, input.client);

  if (!survey) {
    throw new UnknownSurveyError(input.surveyId);
  }

  // Ноль — опрос без награды, штатный случай, а не ошибка. Перевод нулём
  // примитив отвергает, и записи в журнале у такого прохождения нет.
  if (survey.points === 0) {
    return { applied: false, points: 0 };
  }

  // Счёт не заводится: опрос проходит участник программы, и счёт у него появился при
  // регистрации. Завести его здесь значило бы вводить человека в баллы мимо регистрации.
  const driverAccount = await findDriverAccountByPerson(input.personId, input.client);

  if (!driverAccount) {
    throw new DriverAccountMissingError(input.personId);
  }

  const emissionAccount = await getSystemAccount('emission');

  // Повтор держит уникальное ограничение на ключ, а не проверка «уже начисляли»: финал
  // нажимают дважды, и два нажатия приходят одновременно (docs/points.md → «Каждая
  // операция идемпотентна»). Повтор — штатный исход: перевод отдаёт прежнюю запись.
  const { transfer, applied } = await transferPoints({
    reason: 'survey',
    idempotencyKey: buildSurveyIdempotencyKey(input.surveyId, input.personId),
    amount: survey.points,
    fromAccountId: emissionAccount.id,
    toAccountId: driverAccount.id,
    occurredAt: input.occurredAt,
    client: input.client,
  });

  return { applied, points: Number(transfer.amount) };
};
