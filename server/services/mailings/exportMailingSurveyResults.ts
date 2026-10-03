import type { Language } from '#server/generated/prisma/enums';
import { listExportAnswers, listExportPersons, type ExportAnswerRow } from '#server/repositories/surveyResults';
import { listSurveyOptions, listSurveyQuestions, type SurveyQuestionRow } from '#server/repositories/surveys';
import {
  resolveMailingSurveyScope,
  type SurveySliceRequest,
} from '#server/services/mailings/mailingSurveyScope';
import { formatClockTime, formatDayKey } from '#server/utils/parkTime';

/**
 * Выгрузка итогов опроса у рассылки (issue #325): строка на человека из снимка.
 *
 * Имени и телефона в файле нет — в решении названа выгрузка с позывным. Позывной уникальности
 * не имеет (86 позывных стоят на нескольких профилях), поэтому рядом идентификатор человека.
 *
 * Срез не отбирает строки, а добавляет колонку «Срез»: строк в файле всегда столько, сколько
 * в снимке, а сравнение делается фильтром в Excel (решение Руслана 03-10-2026). Без среза
 * колонки нет.
 *
 * Возвращает строки таблицы, а не файл: разметку CSV кладёт ручка (`server/utils/csvDownload.ts`).
 */

const LANGUAGE_TEXT: Record<Language, string> = {
  ru: 'русский',
  uz: 'узбекский',
};

/** Метка воронки по Ташкенту — `2026-10-03 14:32`; этапа не было — пусто. */
const formatMoment = (moment: Date | null): string =>
  moment === null ? '' : `${formatDayKey(moment)} ${formatClockTime(moment)}`;

const questionHeader = (question: SurveyQuestionRow, index: number): string =>
  `${index + 1}. ${question.textRu ?? ''}`.trim();

/**
 * Ответ одной ячейкой: варианты через `;`, «Свой вариант» после них в той же ячейке
 * (решение Руслана 03-10-2026), число шкалы, текст. Пропущенный — пусто.
 */
const answerCell = (answer: ExportAnswerRow | undefined, optionTexts: Map<string, string>): string => {
  if (!answer) {
    return '';
  }

  if (answer.scaleValue !== null) {
    return String(answer.scaleValue);
  }

  if (answer.textValue !== null) {
    return answer.textValue;
  }

  const parts = answer.optionIds.map((optionId) => optionTexts.get(optionId) ?? '');

  if (answer.ownText !== null) {
    parts.push(`Свой вариант: ${answer.ownText}`);
  }

  return parts.join('; ');
};

export type MailingSurveyExport = {
  fileName: string;
  /** Первая — заголовки. */
  rows: string[][];
};

export const exportMailingSurveyResults = async (
  mailingId: string,
  slice: SurveySliceRequest,
): Promise<MailingSurveyExport> => {
  const { mailing, scope } = await resolveMailingSurveyScope(mailingId, slice);
  const sliced = scope.slice !== null;

  const [questions, options, persons, answers] = await Promise.all([
    listSurveyQuestions(scope.surveyId),
    listSurveyOptions(scope.surveyId),
    listExportPersons(scope),
    listExportAnswers(scope),
  ]);

  const optionTexts = new Map(options.map((option) => [option.id, option.textRu ?? '']));
  const answersByPerson = new Map<string, Map<string, ExportAnswerRow>>();

  for (const answer of answers) {
    const personAnswers = answersByPerson.get(answer.personId) ?? new Map<string, ExportAnswerRow>();
    personAnswers.set(answer.questionId, answer);
    answersByPerson.set(answer.personId, personAnswers);
  }

  const header = [
    'ID человека',
    'Позывной',
    'Язык',
    ...(sliced ? ['Срез'] : []),
    'Доставлено',
    'Открыл опрос',
    'Отказался',
    'Начал',
    'Прошёл',
    'Перешёл в приложение',
    ...questions.map(questionHeader),
  ];

  const rows = persons.map((person) => {
    const personAnswers = answersByPerson.get(person.personId);

    return [
      person.personId,
      person.callsigns.join(', '),
      person.language === null ? '' : LANGUAGE_TEXT[person.language],
      ...(sliced ? [person.inSlice ? 'внутри' : 'остальные'] : []),
      formatMoment(person.deliveredAt),
      formatMoment(person.openedAt),
      formatMoment(person.declinedAt),
      formatMoment(person.startedAt),
      formatMoment(person.completedAt),
      formatMoment(person.appClickedAt),
      ...questions.map((question) => answerCell(personAnswers?.get(question.id), optionTexts)),
    ];
  });

  const title = mailing.surveyTitle ?? 'Без названия';

  return {
    fileName: `Итоги опроса — ${title} — ${formatDayKey(new Date())}.csv`,
    rows: [header, ...rows],
  };
};
