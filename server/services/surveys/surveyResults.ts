import {
  listAnswerTotals,
  listDropOffGroups,
  listFunnelGroups,
  listOptionCounts,
  listScaleCounts,
  listTextAnswers,
  type SliceFlag,
  type SurveyResultsScope,
} from '#server/repositories/surveyResults';
import type { SurveyOptionRow, SurveyQuestionRow } from '#server/repositories/surveys';
import type {
  SurveyFunnel,
  SurveyFunnelResults,
  SurveyFunnelStage,
  SurveyQuestionResult,
  SurveyResultsColumn,
  SurveyTextResult,
} from '#shared/types/surveyResults';

/**
 * Сборка итогов опроса по колонкам (issue #325) — общая для рассылки и сводки у опроса.
 *
 * Операцией не является и поэтому лежит отдельным файлом, как `fields.ts`: строки репозитория
 * приходят группами среза, а таблица хочет числа по колонкам. Итог — сумма групп, а не свой
 * подсчёт: так «внутри» и «остальные» складываются в него по построению.
 */

const FUNNEL_STAGES: readonly SurveyFunnelStage[] = [
  'sent',
  'delivered',
  'opened',
  'declined',
  'started',
  'completed',
  'appClicked',
];

/** Оценки шкалы — фиксированы и вариантами не заводятся. */
const SCALE_VALUES = [1, 2, 3, 4, 5] as const;

export const resultsColumns = (sliced: boolean): SurveyResultsColumn[] =>
  sliced ? ['total', 'inside', 'rest'] : ['total'];

const columnMatches = (column: SurveyResultsColumn, inSlice: SliceFlag): boolean =>
  column === 'total' || (column === 'inside' ? inSlice === true : inSlice === false);

/** Числа по колонкам: сумма значений строк, попавших в колонку. */
const sumByColumns = <Row extends { inSlice: SliceFlag }>(
  columns: SurveyResultsColumn[],
  rows: Row[],
  value: (row: Row) => number,
): number[] =>
  columns.map((column) =>
    rows.reduce((sum, row) => (columnMatches(column, row.inSlice) ? sum + value(row) : sum), 0),
  );

const textColumn = (inSlice: SliceFlag): SurveyTextResult['column'] =>
  inSlice === null ? null : inSlice ? 'inside' : 'rest';

/** Воронка и «Где бросают» — по порядку вопросов, с нулями у вопросов, где не бросал никто. */
export const readFunnelResults = async (
  scope: SurveyResultsScope,
  questions: SurveyQuestionRow[],
): Promise<SurveyFunnelResults> => {
  const columns = resultsColumns(scope.slice !== null);

  const [funnelRows, dropOffRows] = await Promise.all([
    listFunnelGroups(scope),
    listDropOffGroups(scope),
  ]);

  const funnel = Object.fromEntries(
    FUNNEL_STAGES.map((stage) => [stage, sumByColumns(columns, funnelRows, (row) => row[stage])]),
  ) as SurveyFunnel;

  return {
    columns,
    funnel,
    dropOff: questions.map((question, index) => ({
      questionId: question.id,
      position: index + 1,
      textRu: question.textRu,
      people: sumByColumns(
        columns,
        dropOffRows.filter((row) => row.questionId === question.id),
        (row) => row.people,
      ),
    })),
  };
};

/** Ответы по вопросам — по людям круга, при `completedOnly` — только прошедших. */
export const readQuestionResults = async (
  scope: SurveyResultsScope,
  completedOnly: boolean,
  questions: SurveyQuestionRow[],
  options: SurveyOptionRow[],
): Promise<SurveyQuestionResult[]> => {
  const columns = resultsColumns(scope.slice !== null);

  const [totals, optionCounts, scaleCounts, textAnswers] = await Promise.all([
    listAnswerTotals(scope, completedOnly),
    listOptionCounts(scope, completedOnly),
    listScaleCounts(scope, completedOnly),
    listTextAnswers(scope, completedOnly),
  ]);

  return questions.map((question, index) => {
    const questionTotals = totals.filter((row) => row.questionId === question.id);
    const questionTexts = textAnswers.filter((row) => row.questionId === question.id);

    const ownTexts: SurveyTextResult[] = questionTexts.flatMap((row) =>
      row.ownText === null ? [] : [{ text: row.ownText, column: textColumn(row.inSlice) }],
    );

    const scaleValues = SCALE_VALUES.map((value) => ({
      value,
      people: sumByColumns(
        columns,
        scaleCounts.filter((row) => row.questionId === question.id && row.value === value),
        (row) => row.people,
      ),
    }));

    return {
      questionId: question.id,
      position: index + 1,
      type: question.type,
      textRu: question.textRu,
      required: question.required,
      answered: sumByColumns(columns, questionTotals, (row) => row.answered),
      skipped: sumByColumns(columns, questionTotals, (row) => row.skipped),
      options: options
        .filter((option) => option.questionId === question.id)
        .map((option) => ({
          optionId: option.id,
          textRu: option.textRu,
          people: sumByColumns(
            columns,
            optionCounts.filter((row) => row.optionId === option.id),
            (row) => row.people,
          ),
        })),
      ownAnswer: question.allowOwnAnswer
        ? {
            people: sumByColumns(columns, questionTotals, (row) => row.ownAnswers),
            texts: ownTexts,
          }
        : null,
      scale:
        question.type === 'scale'
          ? {
              values: scaleValues,
              mean: columns.map((_, columnIndex) => {
                const people = scaleValues.reduce(
                  (sum, entry) => sum + (entry.people[columnIndex] ?? 0),
                  0,
                );
                const points = scaleValues.reduce(
                  (sum, entry) => sum + entry.value * (entry.people[columnIndex] ?? 0),
                  0,
                );

                return people > 0 ? points / people : null;
              }),
            }
          : null,
      texts:
        question.type === 'text'
          ? questionTexts.flatMap((row) =>
              row.textValue === null ? [] : [{ text: row.textValue, column: textColumn(row.inSlice) }],
            )
          : null,
    };
  });
};
