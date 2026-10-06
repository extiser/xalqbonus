import { markWelcomeBonusSeen as writeWelcomeBonusSeen } from '#server/repositories/drivers';
import { WelcomeBonusNotAwardedError } from '#server/services/points/errors';
import { readWelcomeBonus } from '#server/services/points/readWelcomeBonus';

/**
 * Водитель нажал «Спасибо» на слайде «Ура! Бонус зачислен!» (issue #421): слайд больше
 * не показывается.
 *
 * Отметка ставится только выданному бонусу — тем же сервисом, что решает, показывать ли слайд:
 * отметка до выдачи погасила бы праздник, которого водитель ещё не видел. Стоящая отметка
 * не меняется — условием записи в репозитории, а не проверкой здесь: два запроса в пути
 * разошлись бы между чтением и записью.
 *
 * «Сейчас» — параметром, как у экрана участника: тест задаёт его явно.
 */
export const markWelcomeBonusSeen = async (personId: string, now: Date): Promise<void> => {
  const bonus = await readWelcomeBonus(personId);

  if (bonus?.state !== 'awarded') {
    throw new WelcomeBonusNotAwardedError(personId);
  }

  await writeWelcomeBonusSeen(personId, now);
};
