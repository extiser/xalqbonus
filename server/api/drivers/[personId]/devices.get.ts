import { readDriverDevices } from '#server/services/devices/readDriverDevices';
import { requireEmployee } from '#server/utils/employeeAuth';
import { requireUuidParam } from '#server/utils/query';
import type { DriverDevicesResponse } from '#shared/types/driver';

// Устройства водителя в карточке (issue #223): с чего он открывал Mini App и прошёл ли его
// браузер проверку движка. Своей ручкой, как награды: читаются отдельно от карточки.
//
// Доступ — как у самой карточки. Человек без привязок отвечает пустым списком: существование
// человека отвечает карточка.
export default defineEventHandler(async (event): Promise<DriverDevicesResponse> => {
  await requireEmployee(event);

  return readDriverDevices(requireUuidParam(event, 'personId'));
});
