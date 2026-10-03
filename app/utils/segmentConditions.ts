import type { SelectOption } from '~/types/selectOption';
import { formatNumber } from '~/utils/format';
import { surveyOptionLabel } from '~/utils/labels';
import type { SegmentConditions, SegmentSurveyState } from '#shared/types/segment';
import type { SurveyListItem } from '#shared/types/survey';

/**
 * Условия сегмента на стороне формы: перевод между полями и контрактом ручки и подпись
 * условий словами.
 *
 * Поля числа держат строку, а не число: пустое поле числом не выражается (`NumberInput`).
 * Признаки — тремя значениями, а не флажком: «не важно» и «нет» — разные условия, и флажок
 * в снятом положении не сказал бы, какое из двух имелось в виду.
 *
 * Условие по опросу (issue #324) — опрос и значение. Пустой опрос — условия нет, и значение
 * тогда в контракт не уходит: заданы оба или ни одного.
 */

export type SegmentFlagChoice = 'any' | 'yes' | 'no';

export type SegmentConditionsDraft = {
  daysSinceTripMin: string;
  daysSinceTripMax: string;
  programMember: SegmentFlagChoice;
  telegramLinked: SegmentFlagChoice;
  balanceMin: string;
  balanceMax: string;
  /** Пусто — условия по опросу нет. */
  surveyId: string;
  surveyState: SegmentSurveyState;
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

export const SURVEY_STATE_OPTIONS: SelectOption[] = [
  { value: 'not_completed', label: 'Получил, но не прошёл' },
  { value: 'declined', label: 'Отказался' },
];

/**
 * Опросы для условия: замороженные того же мира, закрытые по сроку тоже — по ним бывает нужна
 * рассылка-благодарность или разбор. Черновик ни разу не уходил, и состав по нему пуст
 * по построению. Уже выбранный стоит в списке всегда: он записан в сегменте.
 */
export const segmentSurveyOptions = (
  surveys: SurveyListItem[],
  isDemo: boolean,
  selectedSurveyId: string,
): SelectOption[] =>
  surveys
    .filter(
      (survey) =>
        survey.surveyId === selectedSurveyId ||
        (survey.frozenAt !== null && survey.isDemo === isDemo),
    )
    .map((survey) => ({ value: survey.surveyId, label: surveyOptionLabel(survey) }));

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
 */
const fromBoundDraft = (value: string): number | null => {
  const text = value.trim();

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
  surveyId: conditions.surveyId ?? '',
  surveyState: conditions.surveyState ?? 'not_completed',
});

export const fromConditionsDraft = (draft: SegmentConditionsDraft): SegmentConditions => ({
  daysSinceTripMin: fromBoundDraft(draft.daysSinceTripMin),
  daysSinceTripMax: fromBoundDraft(draft.daysSinceTripMax),
  programMember: fromFlagDraft(draft.programMember),
  telegramLinked: fromFlagDraft(draft.telegramLinked),
  balanceMin: fromBoundDraft(draft.balanceMin),
  balanceMax: fromBoundDraft(draft.balanceMax),
  surveyId: draft.surveyId === '' ? null : draft.surveyId,
  surveyState: draft.surveyId === '' ? null : draft.surveyState,
});

/** Совпадают ли условия — по каждому полю, а не сравнением строк JSON с их порядком ключей. */
export const sameSegmentConditions = (left: SegmentConditions, right: SegmentConditions): boolean =>
  left.daysSinceTripMin === right.daysSinceTripMin &&
  left.daysSinceTripMax === right.daysSinceTripMax &&
  left.programMember === right.programMember &&
  left.telegramLinked === right.telegramLinked &&
  left.balanceMin === right.balanceMin &&
  left.balanceMax === right.balanceMax &&
  left.surveyId === right.surveyId &&
  left.surveyState === right.surveyState;

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
 * не входит, и называть его значит путать. Название опроса условия приходит с сегментом.
 */
export const describeSegmentConditions = (
  conditions: SegmentConditions,
  surveyTitle: string | null,
): string[] => {
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

  if (conditions.surveyState !== null) {
    const survey = `«${surveyTitle ?? 'Без названия'}»`;

    parts.push(
      conditions.surveyState === 'declined'
        ? `отказался от опроса ${survey}`
        : `получил опрос ${survey}, но не прошёл`,
    );
  }

  return parts;
};
