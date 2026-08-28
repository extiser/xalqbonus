/**
 * Контрольные цифры переноса.
 *
 * Взяты из разбора старой схемы `_reference/legacy/public-schema-2026-08-27.md` и отчёта
 * по выгрузке реестра. Расхождение с любой из них — повод остановиться и разобраться,
 * а не подогнать цифру: перенос на 25 тысячах строк, который «почти сошёлся», отличается
 * от сошедшегося ровно тем, что никто не знает, где именно он не сошёлся.
 */

export type ControlFigure = {
  title: string;
  expected: number;
  actual: number;
  /** Откуда взято ожидание — чтобы расхождение было с чем сверять. */
  source: string;
};

export type ControlCheck = ControlFigure & { matches: boolean };

export class ControlFiguresError extends Error {
  constructor(public readonly failed: readonly ControlCheck[]) {
    super(
      `перенос разошёлся с контрольными цифрами:\n${failed
        .map((check) => `  ${check.title}: ожидалось ${check.expected}, получилось ${check.actual} (${check.source})`)
        .join('\n')}`,
    );
    this.name = 'ControlFiguresError';
  }
}

export const checkControlFigures = (figures: readonly ControlFigure[]): ControlCheck[] =>
  figures.map((figure) => ({ ...figure, matches: figure.expected === figure.actual }));

export const assertControlFigures = (checks: readonly ControlCheck[]): void => {
  const failed = checks.filter((check) => !check.matches);

  if (failed.length > 0) {
    throw new ControlFiguresError(failed);
  }
};
