import type { PromoMedium } from '../../server/generated/prisma/enums';

/**
 * Ответы ручек раздела «Промо» (issue #380). Определения цифр — `shared/metrics.ts`,
 * ключи `promo*`.
 *
 * Моменты — строки ISO, сутки — `YYYY-MM-DD` по Ташкенту: календарный день зона показа
 * сдвигать не должна.
 */

/** Воронка метки за всё время. */
export type PromoFunnelCounts = {
  /** Разные Telegram среди касаний метки. */
  went: number;
  /** Вступили по метке: последнее касание перед первой привязкой — этой метки. */
  joined: number;
  /** Вступившие по метке с завершённой поездкой после вступления. */
  firstTrip: number;
  /** Перешедшие, у которых первое касание метки было уже участником. */
  already: number;
};

export type PromoLinkRow = PromoFunnelCounts & {
  code: string;
  name: string;
  medium: PromoMedium;
  placement: string | null;
  createdAt: string;
};

export type PromoList = {
  /** Новые сверху. */
  links: PromoLinkRow[];
  /** Перешли и уже были — разные люди по всем меткам; вступили и первая поездка — сумма меток. */
  totals: PromoFunnelCounts;
};

export type PromoNewCode = {
  code: string;
  /** Ссылка в бота с этим кодом — форма показывает её до создания метки. */
  link: string;
};

export type PromoCreated = {
  code: string;
};

/** Сутки графика «Переходы по дням»: разные люди за сутки по Ташкенту. */
export type PromoDay = {
  day: string;
  people: number;
};

/** Вступивший по метке — строка таблицы «Вступили по этой метке». */
export type PromoJoinedPerson = {
  personId: string;
  /** Из профиля с последней поездкой человека, нет поездок — из любого его профиля. */
  callsign: string | null;
  name: string | null;
  /** Засчитанное касание — последнее перед вступлением. */
  touchedAt: string;
  joinedAt: string;
  firstTripAt: string | null;
};

export type PromoCard = {
  promo: {
    code: string;
    name: string;
    medium: PromoMedium;
    placement: string | null;
    createdAt: string;
    /** Имя сотрудника, заведшего метку; `null` — заведена миграцией при выкате. */
    createdBy: string | null;
  };
  /** Ссылка в бота с кодом метки. */
  link: string;
  funnel: PromoFunnelCounts & {
    /** Все открытия бота по метке, с повторами. */
    touches: number;
  };
  /** С более ранней из двух дат — создания метки и первого касания — по сегодняшние. */
  days: PromoDay[];
  /** Все вступившие, новые сверху. */
  joined: PromoJoinedPerson[];
};
