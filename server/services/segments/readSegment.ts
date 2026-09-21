import { countSegmentMembers, findSegment, listSegments } from '#server/repositories/segments';
import { UnknownSegmentError } from '#server/services/segments/errors';
import { toSegment } from '#server/services/segments/fields';
import type { Segment, SegmentListResponse } from '#shared/types/segment';

/** Сегмент по ссылке — и архивный тоже. Нет такого — `UnknownSegmentError`. */
export const readSegment = async (segmentId: string): Promise<Segment> => {
  const row = await findSegment(segmentId);

  if (!row) {
    throw new UnknownSegmentError(segmentId);
  }

  return toSegment(row);
};

/**
 * Список сегментов с числом водителей на сейчас.
 *
 * Число считается тем же построителем, что предпросмотр и выдача потребителю
 * (`repositories/segments.ts` → `segmentMembersSql`), по запросу на сегмент: их десятки,
 * а число, лежащее колонкой, врало бы уже назавтра — давность ползёт каждый день.
 */
export const readSegmentList = async (): Promise<SegmentListResponse> => {
  const segments = (await listSegments()).map(toSegment);
  const counts = await Promise.all(
    segments.map((segment) => countSegmentMembers(segment.conditions)),
  );

  return {
    segments: segments.map((segment, index) => ({
      ...segment,
      total: counts[index]?.total ?? 0,
    })),
    // Момент ответа, а не каждого подсчёта: подсчёты идут разом и расходятся на миллисекунды.
    calculatedAt: new Date().toISOString(),
  };
};
