/**
 * Контрольные цифры переноса: эталон против результата.
 *
 * Эталон снимается со старой схемы и выгрузки реестра **до** шагов, которые пишут карту
 * переноса и балансы; результат читается из `xb` **после** них. Источники разные, и в этом
 * вся проверка: перенос, потерявший часть записей, разведёт их, а прошедший целиком — нет.
 *
 * Эталон больше не константа. Раньше семь чисел были зашиты в скрипт по дампу
 * от 27-08-2026, и до тех пор, пока перенос был разовой локальной операцией, это работало.
 * Перенос выполняется в день выката на прод, дата которого заранее неизвестна, и к тому
 * моменту все семь будут другими: константа остановила бы прогон на первой же проверке
 * (docs/roadmap.md → «Выход в прод»).
 *
 * Расхождение по-прежнему останавливает прогон. Перенос на 25 тысячах строк, который
 * «почти сошёлся», отличается от сошедшегося ровно тем, что никто не знает, где именно
 * он не сошёлся.
 */

/** Семь величин, снятых со старой схемы и выгрузки реестра до переноса. */
export type ControlBaseline = {
  /** Когда снят эталон и с какой базы — обе строки уходят в отчёт. */
  takenAt: Date;
  databaseName: string;
  matchedRecords: number;
  pointsTransferred: number;
  positiveBalances: number;
  personsWithSeveralProfiles: number;
  mergedPairs: number;
  invalidChatIds: number;
  unmatchedRecords: number;
};

/** Те же семь величин, прочитанные из `xb` после переноса. */
export type ControlActual = {
  matchedRecords: number;
  pointsTransferred: number;
  positiveBalances: number;
  personsWithSeveralProfiles: number;
  mergedPairs: number;
  invalidChatIds: number;
  unmatchedRecords: number;
};

export type ControlFigure = {
  title: string;
  expected: number;
  actual: number;
  /** Чем снят эталон. */
  baselineSource: string;
  /** Чем прочитан результат. */
  actualSource: string;
};

export type ControlCheck = ControlFigure & { matches: boolean };

type ControlFigureKey = keyof ControlActual;

/**
 * Что с чем сверяется. Таблица описательная и держится в одном месте намеренно: пара
 * источников у каждой величины — это и есть содержание проверки, и разъехаться описанию
 * с самой сверкой негде.
 *
 * Двум величинам эталон снимается не запросом. Склеенные пары старая схема не выводит
 * вовсе — двойники опознаются реестром парка, а не ею. Люди с несколькими профилями
 * к старой схеме отношения не имеют совсем: это свойство выгрузки парка. Обе считаются
 * теми же правилами, которыми их считает сам перенос, и берутся из одного места с ним.
 */
const FIGURES: readonly {
  key: ControlFigureKey;
  title: string;
  baselineSource: string;
  actualSource: string;
}[] = [
  {
    key: 'matchedRecords',
    title: 'сопоставленных записей старой базы',
    baselineSource: '`public."Drivers"` ⋈ реестр парка',
    actualSource: '`xb.legacy_driver_map`',
  },
  {
    key: 'pointsTransferred',
    title: 'перенесённых баллов',
    baselineSource: 'сумма `public."Drivers".points` по сопоставленным',
    actualSource: 'сумма операций `opening` в журнале `xb`',
  },
  {
    key: 'positiveBalances',
    title: 'записей старой базы с положительным балансом',
    baselineSource: '`public."Drivers"` ⋈ реестр парка',
    actualSource: '`xb.legacy_driver_map`',
  },
  {
    key: 'personsWithSeveralProfiles',
    title: 'человек с несколькими профилями в парке',
    baselineSource: 'группы канонических номеров ВУ в выгрузке реестра',
    actualSource: '`xb.park_profiles`',
  },
  {
    key: 'mergedPairs',
    title: 'склеенных пар двойников',
    baselineSource: 'правило склейки шага сопоставления',
    actualSource: '`xb.legacy_driver_map`',
  },
  {
    key: 'invalidChatIds',
    title: 'непригодных `chat_id`',
    baselineSource: 'шаблон `utils/legacyChatId` по `public."Drivers"`',
    actualSource: '`xb.legacy_driver_map`',
  },
  {
    key: 'unmatchedRecords',
    title: 'непереносимых записей',
    baselineSource: '`public."Drivers"` ⋈ реестр парка',
    actualSource: '`xb.legacy_driver_map`',
  },
];

export class ControlFiguresError extends Error {
  constructor(public readonly failed: readonly ControlCheck[]) {
    super(
      `перенос разошёлся с контрольными цифрами:\n${failed
        .map(
          (check) =>
            `  ${check.title}: эталон ${check.expected} (${check.baselineSource}), получилось ${check.actual} (${check.actualSource})`,
        )
        .join('\n')}`,
    );
    this.name = 'ControlFiguresError';
  }
}

export const checkControlFigures = (
  baseline: ControlBaseline,
  actual: ControlActual,
): ControlCheck[] =>
  FIGURES.map((figure) => ({
    title: figure.title,
    expected: baseline[figure.key],
    actual: actual[figure.key],
    baselineSource: figure.baselineSource,
    actualSource: figure.actualSource,
    matches: baseline[figure.key] === actual[figure.key],
  }));

export const assertControlFigures = (checks: readonly ControlCheck[]): void => {
  const failed = checks.filter((check) => !check.matches);

  if (failed.length > 0) {
    throw new ControlFiguresError(failed);
  }
};
