import { readSegmentList } from '#server/services/segments/readSegment';
import { requireEmployeeRole } from '#server/utils/employeeAuth';
import { SEGMENT_ROLES } from '#shared/access';
import type { SegmentListResponse } from '#shared/types/segment';

// Список сегментов с числом водителей на сейчас — архивные тоже, последними и с отметкой.
// Менеджер получает отказ двери `role_not_allowed`.
export default defineEventHandler(async (event): Promise<SegmentListResponse> => {
  await requireEmployeeRole(event, SEGMENT_ROLES);

  return readSegmentList();
});
