import type { SelectOption } from '~/types/selectOption';
import { formatNumber } from '~/utils/format';
import type { SegmentConditions } from '#shared/types/segment';

/**
 * Условия сегмента на стороне формы: перевод между полями и контрактом ручки и подпись
 * условий словами.
 *
 * Поля числа держат строку, а не число: пустое поле числом не выражается (`NumberInput`).
 * Признаки — тремя значениями, а не флажком: «не важно» и «нет» — разные условия, и флажок
 * в снятом положении не сказал бы, какое из двух имелось в виду.
 */

export type SegmentFlagChoice = 'any' | 'yes' | 'no';

export type SegmentConditionsDraft = {
  daysSinceTripMin: string;
  daysSinceTripMax: string;
  programMember: SegmentFlagChoice;
  telegramLinked: SegmentFlagChoice;
  balanceMin: string;
  balanceMax: string;
};

export const PROGRAM_MEMBER_OPTIONS: SelectOption[] = [
  { value: 'any', label: 'Не важно' },
  { value: 'yes', label: 'Участник программы' },
  { value: 'no', label: 'Не участник' },
];

export const TELEGRAM_LINKED_OPTIONS: SelectOption[] = [
  { value: 'any', label: 'Не важно' },
  { value: 'yes', label: 'Привязка есть' },
  { value: 'no', label: 'Привязки нет' },
];

const toBoundDraft = (value: number | null): string => (value === null ? '' : String(value));

const toFlagDraft = (value: boolean | null): SegmentFlagChoice => {
  if (value === null) {
    return 'any';
  }

  return value ? 'yes' : 'no';
};

/**
 * Пустое поле — не заданная граница. Набранное уходит числом как есть: дробь и прочее
 * отвергнет сервер тем же отказом, что для чужого клиента, — вторая проверка здесь сказала бы
 * то же самое вторым текстом.
 *
 * Через `String`, хотя тип обещает строку: `v-model` на `<input type="number">` сам приводит
 * набранное к числу, и в модель приезжает `20`, а не `'20'`, — пустое поле при этом остаётся
 * пустой строкой.
 */
const fromBoundDraft = (value: string): number | null => {
  const text = String(value).trim();

  return text === '' ? null : Number(text);
};

const fromFlagDraft = (value: SegmentFlagChoice): boolean | null =>
  value === 'any' ? null : value === 'yes';

export const toConditionsDraft = (conditions: SegmentConditions): SegmentConditionsDraft => ({
  daysSinceTripMin: toBoundDraft(conditions.daysSinceTripMin),
  daysSinceTripMax: toBoundDraft(conditions.daysSinceTripMax),
  programMember: toFlagDraft(conditions.programMember),
  telegramLinked: toFlagDraft(conditions.telegramLinked),
  balanceMin: toBoundDraft(conditions.balanceMin),
  balanceMax: toBoundDraft(conditions.balanceMax),
});

export const fromConditionsDraft = (draft: SegmentConditionsDraft): SegmentConditions => ({
  daysSinceTripMin: fromBoundDraft(draft.daysSinceTripMin),
  daysSinceTripMax: fromBoundDraft(draft.daysSinceTripMax),
  programMember: fromFlagDraft(draft.programMember),
  telegramLinked: fromFlagDraft(draft.telegramLinked),
  balanceMin: fromBoundDraft(draft.balanceMin),
  balanceMax: fromBoundDraft(draft.balanceMax),
});

/** Совпадают ли условия — по каждому полю, а не сравнением строк JSON с их порядком ключей. */
export const sameSegmentConditions = (left: SegmentConditions, right: SegmentConditions): boolean =>
  left.daysSinceTripMin === right.daysSinceTripMin &&
  left.daysSinceTripMax === right.daysSinceTripMax &&
  left.programMember === right.programMember &&
  left.telegramLinked === right.telegramLinked &&
  left.balanceMin === right.balanceMin &&
  left.balanceMax === right.balanceMax;

/** Граница словами: «20–90», «от 20», «до 90». `null` — условие не задано. */
const describeRange = (min: number | null, max: number | null): string | null => {
  if (min !== null && max !== null) {
    return `${formatNumber(min)}–${formatNumber(max)}`;
  }

  if (min !== null) {
    return `от ${formatNumber(min)}`;
  }

  return max === null ? null : `до ${formatNumber(max)}`;
};

/**
 * Условия словами — для строки списка и шапки карточки. Только заданные: незаданное в отбор
 * не входит, и называть его значит путать.
 */
export const describeSegmentConditions = (conditions: SegmentConditions): string[] => {
  const parts: string[] = [];
  const days = describeRange(conditions.daysSinceTripMin, conditions.daysSinceTripMax);
  const balance = describeRange(conditions.balanceMin, conditions.balanceMax);

  if (days !== null) {
    parts.push(`с последней поездки ${days} дн.`);
  }

  if (conditions.programMember !== null) {
    parts.push(conditions.programMember ? 'участник программы' : 'не участник программы');
  }

  if (conditions.telegramLinked !== null) {
    parts.push(conditions.telegramLinked ? 'Telegram привязан' : 'без привязки Telegram');
  }

  if (balance !== null) {
    parts.push(`баланс ${balance}`);
  }

  return parts;
};
