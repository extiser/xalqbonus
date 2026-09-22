import { readDriverRewards } from '#server/services/rewards/readDriverRewards';
import { requireEmployee } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import type { DriverRewardsResponse } from '#shared/types/rewards';

// Награды водителя в карточке (issue #175). Своей ручкой, а не полем карточки: карточка
// и так собирает пять разделов, а награды читаются отдельно и живут своим порядком.
//
// Доступ — как у самой карточки: кто видит карточку водителя, тот видит и его награды.
// Человек вне реестра отвечает пустым списком: существование человека отвечает карточка.
export default defineEventHandler(async (event): Promise<DriverRewardsResponse> => {
  await requireEmployee(event);

  return readDriverRewards(requireUuidParam(event, 'personId'));
});
