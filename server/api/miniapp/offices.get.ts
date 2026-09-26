import { readMemberOffices } from '#server/services/offices/readMemberOffices';
import { requireMember } from '#server/utils/miniAppMember';
import type { MiniAppOfficesResponse } from '#shared/types/miniapp';

// Офисы, где водитель может обменять баллы: только работающие, с адресом и часами.
export default defineEventHandler(async (event): Promise<MiniAppOfficesResponse> => {
  const driver = await requireMember(event);

  return readMemberOffices({ isDemo: driver.isDemo });
});
