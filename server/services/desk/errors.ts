/**
 * Отказ стойки выдачи (issue #172): по коду в этом офисе не нашлось ни висящего заказа,
 * ни ждущей награды. Чужой офис, несуществующий код и строка, не похожая на код, — один
 * и тот же отказ: код не подтверждает существование заказа или награды тому, кто стоит не там.
 */
export class DeskCodeNotFoundError extends Error {
  constructor(public readonly code: string) {
    super(`по коду ${code} в офисе ничего не ждёт выдачи`);
    this.name = 'DeskCodeNotFoundError';
  }
}
