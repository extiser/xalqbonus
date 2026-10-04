/**
 * Месяц словом в нужном падеже — для подписей дашборда (issue #371): «Октябрь 2026» в выборе
 * месяца, «к сентябрю» и «в сентябре» у базы сравнения, «сентябрь — 30 из 30» у покрытия.
 *
 * Словарём, а не `Intl`: тот даёт именительный и родительный, а дательного и предложного
 * у него нет вовсе.
 */

type MonthForms = {
  /** «сентябрь» */
  nominative: string;
  /** «1–4 сентября» */
  genitive: string;
  /** «к сентябрю» */
  dative: string;
  /** «в сентябре» */
  prepositional: string;
};

const MONTH_FORMS: readonly MonthForms[] = [
  { nominative: 'январь', genitive: 'января', dative: 'январю', prepositional: 'январе' },
  { nominative: 'февраль', genitive: 'февраля', dative: 'февралю', prepositional: 'феврале' },
  { nominative: 'март', genitive: 'марта', dative: 'марту', prepositional: 'марте' },
  { nominative: 'апрель', genitive: 'апреля', dative: 'апрелю', prepositional: 'апреле' },
  { nominative: 'май', genitive: 'мая', dative: 'маю', prepositional: 'мае' },
  { nominative: 'июнь', genitive: 'июня', dative: 'июню', prepositional: 'июне' },
  { nominative: 'июль', genitive: 'июля', dative: 'июлю', prepositional: 'июле' },
  { nominative: 'август', genitive: 'августа', dative: 'августу', prepositional: 'августе' },
  { nominative: 'сентябрь', genitive: 'сентября', dative: 'сентябрю', prepositional: 'сентябре' },
  { nominative: 'октябрь', genitive: 'октября', dative: 'октябрю', prepositional: 'октябре' },
  { nominative: 'ноябрь', genitive: 'ноября', dative: 'ноябрю', prepositional: 'ноябре' },
  { nominative: 'декабрь', genitive: 'декабря', dative: 'декабрю', prepositional: 'декабре' },
];

/** Формы месяца по дню `YYYY-MM-DD` или месяцу `YYYY-MM`. */
export const monthForms = (value: string): MonthForms => {
  const forms = MONTH_FORMS[Number(value.slice(5, 7)) - 1];

  if (!forms) {
    throw new Error(`не месяц: ${value}`);
  }

  return forms;
};

/** «Октябрь 2026» — месяц `YYYY-MM` с заглавной и годом. */
export const formatMonthTitle = (month: string): string => {
  const { nominative } = monthForms(month);

  return `${nominative.charAt(0).toUpperCase()}${nominative.slice(1)} ${month.slice(0, 4)}`;
};
