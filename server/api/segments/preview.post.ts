import { readSegmentConditions } from '#server/services/segments/fields';
import { previewSegmentConditions } from '#server/services/segments/previewSegment';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { rethrowSegmentFailure } from '#server/utils/segmentFailure';
import { SEGMENT_ROLES } from '#shared/access';
import type { SegmentPreviewResponse } from '#shared/types/segment';

// Состав по условиям из тела запроса — без сохранения. Ради подбора границ: их крутят
// и смотрят на число, и считать умей только сохранённый сегмент, подбор стал бы
// пересохранением, а в списке остались бы полуфабрикаты.
//
// `POST`, а не `GET` с условиями в адресе: условия — тело формы, и разбирает их тот же
// `readSegmentConditions`, что сохранение, — предпросмотр не примет того, что сохранение
// отвергнет.
//
// Признак демо — из формы (issue #212): демо-сегмент отбирает только демо-водителей. Смотреть
// состав — не править, поэтому владельцем здесь быть не нужно.
type PreviewBody = {
  conditions?: unknown;
  isDemo?: unknown;
  offset?: unknown;
};

export default defineEventHandler(async (event): Promise<SegmentPreviewResponse> => {
  await requireEmployeeRole(event, SEGMENT_ROLES);

  const body = await readBody<PreviewBody | null>(event);
  const offset =
    typeof body?.offset === 'number' && Number.isInteger(body.offset) ? body.offset : 0;

  try {
    return await previewSegmentConditions(
      readSegmentConditions(body?.conditions),
      body?.isDemo === true,
      offset,
    );
  } catch (error) {
    return rethrowSegmentFailure(error);
  }
});
