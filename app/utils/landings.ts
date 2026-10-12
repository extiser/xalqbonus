import { pluralize } from '~/utils/format';

/** Сколько меток показывают лендинг: «2 метки», «нет меток» (issue #478). */
export const landingLabelCount = (count: number): string =>
  count === 0 ? 'нет меток' : `${count} ${pluralize(count, 'метка', 'метки', 'меток')}`;
