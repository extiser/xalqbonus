import { findPersonSettings } from '#server/repositories/drivers';
import { hasLegacyRecord } from '#server/repositories/legacyDriverMap';
import { findTransferOccurredAtByIdempotencyKey } from '#server/repositories/points';
import { countCompletedTripsByPerson } from '#server/repositories/trips';
import { WELCOME_TRIPS_REQUIRED } from '#server/services/points/awardWelcomeBonus';
import { buildWelcomeIdempotencyKey } from '#server/services/points/idempotencyKey';

/**
 * Где человек на пути к приветственному бонусу — для слайда «+300» на главной Mini App
 * и строки в карточке водителя (issue #410).
 *
 * Один сервис на оба экрана и те же проверки, что у выдачи (`awardWelcomeBonus.ts`): обещание,
 * посчитанное своим правилом, разошлось бы с выдачей. Водитель с шестью поездками в истории,
 * пять из которых до вступления, видел бы «5 из 5» и не получал бы ничего.
 *
 * - `progress` — бонус положен и ещё не выдан: сколько зачётных поездок из скольких
 * - `awarded` — перевод с ключом `welcome:<person_id>` есть, с его временем; `seenAt` — когда водитель
 *   нажал «Спасибо» на слайде выданного бонуса (issue #421), пусто — не нажимал
 * - `not_eligible` — перенесён из старой базы: бонус только новым
 */
export type WelcomeBonusState =
  | { state: 'progress'; done: number; total: number; joinedAt: Date }
  | { state: 'awarded'; awardedAt: Date; seenAt: Date | null; joinedAt: Date }
  | { state: 'not_eligible' };

/** `null` — не участник: строки `person_settings` нет, и считать поездки не от чего. */
export const readWelcomeBonus = async (personId: string): Promise<WelcomeBonusState | null> => {
  const settings = await findPersonSettings(personId);

  if (!settings) {
    return null;
  }

  // Порядок — как у выдачи: выданный, потом перенесённый, потом счёт. Выданный первым,
  // потому что бонус, выданный до того, как человек попал в карту переноса, всё равно выдан.
  const awardedAt = await findTransferOccurredAtByIdempotencyKey(buildWelcomeIdempotencyKey(personId));

  if (awardedAt) {
    return { state: 'awarded', awardedAt, seenAt: settings.welcomeBonusSeenAt, joinedAt: settings.joinedAt };
  }

  if (await hasLegacyRecord(personId)) {
    return { state: 'not_eligible' };
  }

  return {
    state: 'progress',
    done: await countCompletedTripsByPerson(personId, WELCOME_TRIPS_REQUIRED),
    total: WELCOME_TRIPS_REQUIRED,
    joinedAt: settings.joinedAt,
  };
};
