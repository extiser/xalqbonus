import { db } from '#server/db';

/**
 * Дешёвый round-trip к серверу базы: проверяется доступность соединения, а не схема.
 * Живёт в репозитории, потому что это единственный слой, которому разрешено знать Prisma.
 */
export const pingDatabase = async (): Promise<void> => {
  await db.$queryRaw`SELECT 1`;
};
