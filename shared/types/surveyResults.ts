/**
 * Контракт итогов опроса (issue #325): воронка, «Где бросают» и ответы по вопросам —
 * у рассылки с опросом и сводно у опроса.
 *
 * Типы лежат в `shared/`, потому что у них два потребителя — обработчик и разметка.
 * Времена уезжают строками ISO-8601, дни — `YYYY-MM-DD`.
 *
 * Числа идут по колонкам таблицы — массивом в порядке `columns`: без среза колонка одна,
 * итог; со срезом — итог, внутри среза и остальные. Внутри и остальные складываются в итог
 * по построению: считаются они одним запросом, а итог — их суммой.
 */

import type { SurveyQuestionType } from '../../server/generated/prisma/enums';

/** Колонка таблицы итогов. */
export type SurveyResultsColumn = 'total' | 'inside' | 'rest';

/** Этапы воронки — по людям, по их состоянию в опросе. */
export type SurveyFunnelStage =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'declined'
  | 'started'
  | 'completed'
  | 'appClicked';

/** Число людей на этапе — по колонкам. */
export type SurveyFunnel = Record<SurveyFunnelStage, number[]>;

/** Остановились на вопросе: последний сохранённый ответ — на нём, опрос не пройден. */
export type SurveyDropOffRow = {
  questionId: string;
  /** С единицы. */
  position: number;
  textRu: string | null;
  /** По колонкам. */
  people: number[];
};

export type SurveyOptionResult = {
  optionId: string;
  textRu: string | null;
  /** Людей, выбравших вариант, — по колонкам. */
  people: number[];
};

/** Свободный ответ — текст вопроса `text` или «Свой вариант». */
export type SurveyTextResult = {
  text: string;
  /** Колонка среза, в которую попал ответивший. Пусто — среза нет. */
  column: 'inside' | 'rest' | null;
};

export type SurveyQuestionResult = {
  questionId: string;
  /** С единицы. */
  position: number;
  type: SurveyQuestionType;
  textRu: string | null;
  required: boolean;
  /** Ответили — сохранённый ответ не пустой. По колонкам. */
  answered: number[];
  /** Пропустили необязательный вопрос — сохранён пустой ответ. По колонкам. */
  skipped: number[];
  /** Варианты по порядку. У `text` и `scale` пусто. */
  options: SurveyOptionResult[];
  /** «Свой вариант» — у вопроса, где он разрешён (issue #335). Иначе пусто. */
  ownAnswer: { people: number[]; texts: SurveyTextResult[] } | null;
  /** Шкала — только у `scale`. */
  scale: {
    /** Оценки 1–5 по порядку: людей с этой оценкой — по колонкам. */
    values: { value: number; people: number[] }[];
    /** Среднее по колонкам. Пусто — оценок в колонке нет. */
    mean: (number | null)[];
  } | null;
  /** Ответы текстом — только у `text`, свежие первыми. */
  texts: SurveyTextResult[] | null;
};

/** Срез, по которому построены колонки «внутри» и «остальные». */
export type SurveyResultsSlice =
  | { kind: 'segment'; segmentId: string; name: string }
  | {
      kind: 'activity';
      /** Первые сутки окна, `YYYY-MM-DD`. */
      windowFrom: string;
      /** Последние сутки окна, `YYYY-MM-DD` — сутки перед сутками запуска. */
      windowTo: string;
      /** Порог верхних 20 %: столько завершённых поездок и больше. Пусто — в окне не ездил никто. */
      minTrips: number | null;
    };

/** Воронка и «Где бросают» — то, что есть и у рассылки, и сводно у опроса. */
export type SurveyFunnelResults = {
  columns: SurveyResultsColumn[];
  funnel: SurveyFunnel;
  /** По порядку вопросов; вопросы, на которых не остановился никто, тоже здесь — нулями. */
  dropOff: SurveyDropOffRow[];
};

/** Итоги опроса у рассылки — одной таблицей. */
export type MailingSurveyResults = SurveyFunnelResults & {
  surveyId: string;
  surveyTitle: string | null;
  slice: SurveyResultsSlice | null;
  /** Ответы только прошедших опрос. Воронку не сужает. */
  completedOnly: boolean;
  /** По порядку. */
  questions: SurveyQuestionResult[];
};

export type MailingSurveyResultsResponse = {
  results: MailingSurveyResults;
};

/** Рассылка, которой ушёл опрос. */
export type SurveyMailingItem = {
  mailingId: string;
  title: string | null;
  startedAt: string;
  /** Строк в снимке — «отправлено» воронки. */
  sent: number;
  /** Из них прошли опрос. */
  completed: number;
};

/**
 * Группа итогов опроса, из которой заводится сегмент-список (issue #356). Круг — сводный,
 * только доставленные; группа — по строке `survey_responses` человека:
 *
 * - `not_completed` — строки нет, или нет ни прохождения, ни отказа
 * - `declined` — отказался и после отказа не прошёл
 * - `completed` — прошёл, в том числе после отказа
 *
 * С воронкой числа сознательно не совпадают: в строке «Отказался» воронки есть и прошедшие
 * после отказа, а в группе «отказались» их нет.
 */
export type SurveyGroup = 'not_completed' | 'declined' | 'completed';

/** Итоги у опроса: его рассылки и сводная воронка по ним, люди без повторов. */
export type SurveyResultsResponse = {
  /** Запущенные, по порядку запуска. */
  mailings: SurveyMailingItem[];
  summary: SurveyFunnelResults;
  /** Людей в группах — те же определения, что у снимка в сегмент-список. */
  groups: Record<SurveyGroup, number>;
};

/** Тело заведения сегмента-списка из итогов опроса. */
export type SurveySegmentRequestBody = {
  group: SurveyGroup;
};
