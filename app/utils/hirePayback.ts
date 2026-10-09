import { formatNumber } from '~/utils/format';
import { dayWord, monthForms } from '#shared/monthNames';
import { pluralize } from '#shared/numberFormat';
import type { DashboardHirePayback } from '#shared/types/dashboard';

/**
 * Подписи «Окупается ли найм» (issue #445), общие у плитки и окна «Расходы на найм»: про один
 * и тот же месяц они обязаны говорить одними словами. У закрытого месяца нанятые — «в сентябре»,
 * у идущего — «с 1 по 9 октября»: месяц ещё не кончился, и нанятые в нём не все.
 */

type HireMonth = Pick<DashboardHirePayback, 'month' | 'ongoing' | 'monthHiredTo'>;

type HireNoteMonth = HireMonth & Pick<DashboardHirePayback, 'valueMonth'>;

/** «с 1 по 9 октября»; первые сутки месяца — «за 1 октября». */
const hiredDays = (monthHiredTo: string): string =>
  monthHiredTo.endsWith('-01') ? `за ${dayWord(monthHiredTo)}` : `с 1 по ${dayWord(monthHiredTo)}`;

/** «72 нанятых», «1 нанятого» — делитель после «÷». */
export const hiredCount = (count: number): string =>
  `${formatNumber(count)} ${pluralize(count, 'нанятого', 'нанятых', 'нанятых')}`;

/** «в сентябре» у закрытого, «с 1 по 9 октября» у идущего — к числу нанятых. */
export const hiredWhen = ({ month, ongoing, monthHiredTo }: HireMonth): string =>
  ongoing ? hiredDays(monthHiredTo) : `в ${monthForms(month).prepositional}`;

/**
 * «Октябрь ещё идёт — нанятые с 1 по 9 октября, доход с нанятого — по сентябрю» — строка под названием
 * у идущего месяца: нанятые и расходы — этого месяца, а доход — по последнему закрытому.
 */
export const ongoingHireNote = ({ month, ongoing, monthHiredTo, valueMonth }: HireNoteMonth): string | null => {
  if (!ongoing) return null;

  const name = monthForms(month).nominative;

  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ещё идёт — нанятые ${hiredDays(monthHiredTo)}, доход с нанятого — по ${monthForms(valueMonth).dative}`;
};

/** Нанятых в месяце нет — стоимость одного не посчитать; у идущего их «пока нет». */
export const noHiredText = ({ month, ongoing }: HireMonth): string =>
  `В ${monthForms(month).prepositional} нанятых ${ongoing ? 'пока нет' : 'нет'} — стоимость одного не посчитать`;
