import { db } from '#server/db';

/**
 * Уборка сегментов, заведённых тестом.
 *
 * Отдельно от уборки по людям: сегмент людей не хранит, а ссылается на сотрудника-автора,
 * и уходить обязан раньше учёток — внешний ключ `created_by_id` стоит на `RESTRICT`.
 */

const createdSegmentIds = new Set<string>();

export const trackTestSegment = (segmentId: string): void => {
  createdSegmentIds.add(segmentId);
};

export const cleanupTestSegments = async (): Promise<void> => {
  const segmentIds = [...createdSegmentIds];
  createdSegmentIds.clear();

  if (segmentIds.length === 0) {
    return;
  }

  await db.$executeRaw`DELETE FROM xb.segments WHERE "id" = ANY(${segmentIds}::uuid[])`;
};
