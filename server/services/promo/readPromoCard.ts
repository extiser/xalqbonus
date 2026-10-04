import { deskDriverName } from '#server/repositories/deskDriver';
import { findPromoLink, listPromoDays, listPromoFunnels, listPromoJoined } from '#server/repositories/promo';
import { readPromoLinkUrl } from '#server/services/promo/promoLinkUrl';
import type { PromoCard } from '#shared/types/promo';

/**
 * Карточка метки (issue #380): метка, ссылка, воронка за всё время, переходы по дням
 * и вступившие по метке. `null` — метки с таким кодом нет.
 *
 * `now` — граница последних суток графика, `readLink` — откуда ссылка в бота. Тест задаёт оба:
 * ряд дней не должен зависеть от того, когда тест запущен, а имя бота спрашивается у Telegram.
 */
export type ReadPromoCardOptions = {
  now?: Date;
  readLink?: (code: string) => Promise<string>;
};

export const readPromoCard = async (
  code: string,
  { now = new Date(), readLink = readPromoLinkUrl }: ReadPromoCardOptions = {},
): Promise<PromoCard | null> => {
  const promo = await findPromoLink(code);

  if (promo === null) {
    return null;
  }

  const [link, funnels, days, joined] = await Promise.all([
    readLink(promo.code),
    listPromoFunnels(promo.code),
    listPromoDays(promo.code, now),
    listPromoJoined(promo.code),
  ]);

  const funnel = funnels[0];

  if (funnel === undefined) {
    throw new Error(`воронка метки ${promo.code} не вернула строку`);
  }

  return {
    promo: {
      code: promo.code,
      name: promo.name,
      medium: promo.medium,
      placement: promo.placement,
      createdAt: promo.createdAt.toISOString(),
      createdBy: promo.createdBy,
    },
    link,
    funnel: {
      went: funnel.went,
      joined: funnel.joined,
      firstTrip: funnel.firstTrip,
      already: funnel.already,
      touches: funnel.touches,
    },
    days,
    joined: joined.map((person) => ({
      personId: person.personId,
      callsign: person.callsign,
      name: deskDriverName(person),
      touchedAt: person.touchedAt.toISOString(),
      joinedAt: person.joinedAt.toISOString(),
      firstTripAt: person.firstTripAt?.toISOString() ?? null,
    })),
  };
};
