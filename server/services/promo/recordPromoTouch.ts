import { insertPromoTouch, type PromoTouchInput, type PromoTouchRow } from '#server/repositories/promo';

/**
 * Запись перехода по промо-метке (issue #377): строка на каждое касание.
 *
 * Пишется каждое касание, а не первое, и касание участника программы тоже — с признаком,
 * что он уже был участником. Справочника меток пока нет —
 * код пишется как пришёл.
 */
export const recordPromoTouch = async (touch: PromoTouchInput): Promise<PromoTouchRow> =>
  insertPromoTouch(touch);
