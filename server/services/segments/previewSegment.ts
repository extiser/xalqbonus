import {
  countSegmentMembers,
  findSegment,
  listSegmentMembersPage,
} from '#server/repositories/segments';
import { UnknownSegmentError } from '#server/services/segments/errors';
import { assertSegmentBounded, toSegmentConditions } from '#server/services/segments/fields';
import { SEGMENT_PREVIEW_LIMIT } from '#shared/segment';
import type {
  SegmentConditions,
  SegmentMember,
  SegmentPreviewResponse,
} from '#shared/types/segment';

/**
 * Предпросмотр состава: число водителей и страница строк на сейчас.
 *
 * Два входа — сохранённый сегмент и условия из формы без сохранения, — а путь один: подбор
 * среза и есть основная работа экрана, границы «20–90» крутят и смотрят, как меняется число,
 * и если бы считать умел только сохранённый сегмент, подбор превратился бы в пересохранение.
 *
 * Предпросмотр ловит сломанный фильтр — ноль или весь парк, — и больше ничего не обещает:
 * взявший «20–90» там, где нужно «30–120», получит свежий и неверный состав.
 */

const previewConditions = async (
  conditions: SegmentConditions,
  isDemo: boolean,
  offset: number,
): Promise<SegmentPreviewResponse> => {
  const [count, rows] = await Promise.all([
    countSegmentMembers(conditions, isDemo),
    listSegmentMembersPage(conditions, isDemo, SEGMENT_PREVIEW_LIMIT, Math.max(offset, 0)),
  ]);

  return {
    total: count.total,
    rows: rows.map(
      (row): SegmentMember => ({
        personId: row.personId,
        lastName: row.lastName,
        firstName: row.firstName,
        middleName: row.middleName,
        callsigns: row.callsigns,
        // Пусто, а не ноль: «счёта нет» и «на счету ноль» — разные вещи.
        balance: row.balance === null ? null : Number(row.balance),
        daysSinceTrip: row.daysSinceTrip,
        telegramLinked: row.telegramLinked,
      }),
    ),
    limit: SEGMENT_PREVIEW_LIMIT,
    offset: Math.max(offset, 0),
    calculatedAt: count.calculatedAt.toISOString(),
  };
};

/** Состав сохранённого сегмента — и архивного тоже: по ссылке он открывается целиком. */
export const previewSavedSegment = async (
  segmentId: string,
  offset: number,
): Promise<SegmentPreviewResponse> => {
  const row = await findSegment(segmentId);

  if (!row) {
    throw new UnknownSegmentError(segmentId);
  }

  return previewConditions(toSegmentConditions(row), row.isDemo, offset);
};

/**
 * Состав по условиям формы, ничего не сохраняя. Условия уже разобраны. Признак демо — тоже
 * из формы (issue #212): несохранённый сегмент сохранится с ним же, и пустые условия у него —
 * все демо-водители. Живому без условий — отказ, как при сохранении.
 */
export const previewSegmentConditions = async (
  conditions: SegmentConditions,
  isDemo: boolean,
  offset: number,
): Promise<SegmentPreviewResponse> => {
  assertSegmentBounded(conditions, isDemo);

  return previewConditions(conditions, isDemo, offset);
};
