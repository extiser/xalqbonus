/**
 * Условие публикации товара — одно на обе стороны.
 *
 * Черновик сохраняется каким угодно: он заводится первым набранным символом и дописывается
 * по ходу (issue #148). Обязательные поля проверяются при публикации, тем же приёмом, что
 * предел длины у рассылки, — и проверяют их двое: ручка публикации, которая решает, и экран,
 * который закрывает кнопку и называет причины рядом с ней. Два списка разошлись бы на первой
 * же правке, и экран пускал бы то, от чего сервер отказывается.
 */

/** Поля товара, от которых зависит публикация. Пусто — `null`. */
export type ProductPublishFields = {
  name: string | null;
  pricePoints: number | null;
  priceRetail: number | null;
  priceCost: number | null;
};

/** Чего не хватает для публикации. */
export type ProductPublishProblem =
  | 'missing_name'
  | 'missing_price_points'
  | 'missing_price_retail'
  | 'missing_price_cost';

const PROBLEM_TEXTS: Readonly<Record<ProductPublishProblem, string>> = {
  missing_name: 'Нет названия.',
  missing_price_points: 'Нет цены в баллах.',
  missing_price_retail: 'Нет розничной цены.',
  missing_price_cost: 'Нет закупочной цены.',
};

export const productPublishProblemText = (problem: ProductPublishProblem): string =>
  PROBLEM_TEXTS[problem];

/**
 * Все причины, по которым товар нельзя опубликовать, сразу. Пустой список — можно.
 *
 * Сразу все, а не первая: правка по одной причине за круг — это три круга там, где хватает
 * одного взгляда. Годность самих цен здесь не решается — ноль баллов не сохраняется вовсе.
 */
export const productPublishProblems = (fields: ProductPublishFields): ProductPublishProblem[] => {
  const problems: ProductPublishProblem[] = [];

  if (fields.name === null || fields.name.trim() === '') {
    problems.push('missing_name');
  }

  if (fields.pricePoints === null) {
    problems.push('missing_price_points');
  }

  if (fields.priceRetail === null) {
    problems.push('missing_price_retail');
  }

  if (fields.priceCost === null) {
    problems.push('missing_price_cost');
  }

  return problems;
};
