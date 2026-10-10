import type { PromoEntry, PromoMedium } from '#server/generated/prisma/enums';
import {
  isPromoEntry,
  isPromoMedium,
  PROMO_NAME_MAX_LENGTH,
  PROMO_PLACEMENT_MAX_LENGTH,
  type PromoDenialCode,
} from '../../../shared/promo';

/**
 * Поля формы метки — разбор и проверка (issue #380). Одни правила у заведения и у правки:
 * у правки просто нет носителя и кода.
 *
 * Проверка — сервисом, а не формой: форма своей проверки не делает (`codex.md` → «Формы —
 * решено»). Поэтому отказ называет все негодные поля сразу, в порядке формы: пустые название
 * и носитель человек должен увидеть вместе, а не исправлять по одному за нажатие. Каждое
 * чтение кладёт свою беду в общий список, а бросает тот, кто прочитал все поля.
 */
export class PromoInputError extends Error {
  constructor(readonly problems: readonly [PromoDenialCode, ...PromoDenialCode[]]) {
    super(`поля метки не годятся: ${problems.join(', ')}`);
    this.name = 'PromoInputError';
  }
}

/** Бросает отказ, если в списке есть хоть одна беда. */
export const throwPromoProblems = (problems: readonly PromoDenialCode[]): void => {
  const [first, ...rest] = problems;

  if (first !== undefined) {
    throw new PromoInputError([first, ...rest]);
  }
};

/** Название: края обрезаются. */
export const readPromoName = (value: unknown, problems: PromoDenialCode[]): string => {
  const name = typeof value === 'string' ? value.trim() : '';

  if (name === '') problems.push('name_missing');
  else if (name.length > PROMO_NAME_MAX_LENGTH) problems.push('name_too_long');

  return name;
};

/** Место: края обрезаются, пустое — не записано. */
export const readPromoPlacement = (value: unknown, problems: PromoDenialCode[]): string | null => {
  const placement = typeof value === 'string' ? value.trim() : '';

  if (placement.length > PROMO_PLACEMENT_MAX_LENGTH) problems.push('placement_too_long');

  return placement === '' ? null : placement;
};

/** Носитель. `null` — не выбран или не из списка; беда тогда уже в списке. */
export const readPromoMedium = (value: unknown, problems: PromoDenialCode[]): PromoMedium | null => {
  if (isPromoMedium(value)) return value;

  problems.push('medium_missing');

  return null;
};

/**
 * Вход (issue #467). Выбирается только у рекламы в Telegram: там значение обязано быть из списка,
 * иначе беда и `null`. У остальных носителей — чат бота, и присланное не читается: форма шлёт
 * вход всегда, а у плаката выбирать нечего. Носитель не выбран — вход тоже чат бота: беда
 * носителя уже в списке, и метка не заведётся.
 */
export const readPromoEntry = (
  value: unknown,
  medium: PromoMedium | null,
  problems: PromoDenialCode[],
): PromoEntry | null => {
  if (medium !== 'telegram_ad') return 'bot';

  if (isPromoEntry(value)) return value;

  problems.push('entry_missing');

  return null;
};
