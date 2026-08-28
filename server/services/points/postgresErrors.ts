/**
 * Разбор отказа базы до кода SQLSTATE и имени ограничения.
 *
 * Нужен, чтобы отбитая базой операция стала внятной доменной ошибкой, а не пятисоткой.
 * Prisma заворачивает отказ сырого запроса в `P2010` и кладёт исходную ошибку драйвера
 * в `meta.driverAdapterError.cause`; форма разная у разных видов нарушений, поэтому
 * читается и `originalCode`, и имя ограничения из двух возможных мест.
 */

/** Нарушение проверки: `CHECK`. */
export const CHECK_VIOLATION = '23514';

/** Ссылка на несуществующую строку: внешний ключ. */
export const FOREIGN_KEY_VIOLATION = '23503';

type DatabaseFailure = {
  code: string;
  constraintName: string | null;
};

const readRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const readString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export const describeDatabaseFailure = (error: unknown): DatabaseFailure | null => {
  const meta = readRecord(readRecord(error)?.['meta']);
  const cause = readRecord(readRecord(meta?.['driverAdapterError'])?.['cause']);

  if (!cause) {
    return null;
  }

  const code = readString(cause['originalCode']) ?? readString(cause['code']);

  if (!code) {
    return null;
  }

  // У нарушения внешнего ключа имя лежит отдельным полем, у проверки — только внутри
  // текста сообщения, поэтому вынимается и оттуда.
  const fromConstraint = readString(readRecord(cause['constraint'])?.['index']);
  const message = readString(cause['originalMessage']) ?? readString(cause['message']) ?? '';
  const fromMessage = /constraint "([^"]+)"/.exec(message)?.[1] ?? null;

  return { code, constraintName: fromConstraint ?? fromMessage };
};

export const isConstraintViolation = (
  error: unknown,
  code: string,
  constraintName?: string,
): boolean => {
  const failure = describeDatabaseFailure(error);

  if (!failure || failure.code !== code) {
    return false;
  }

  return constraintName === undefined || failure.constraintName === constraintName;
};
