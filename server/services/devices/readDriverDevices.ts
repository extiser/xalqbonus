import { listPersonDevices, type PersonDeviceRow } from '#server/repositories/clientDevices';
import type { DriverDevice, DriverDevicesResponse } from '#shared/types/driver';

/**
 * Устройства водителя в карточке сотрудника (issue #223): с чего он открывал Mini App
 * и прошёл ли его браузер проверку движка.
 */

/**
 * Потолок строк. Листания нет: устройств у человека единицы, а строка появляется только
 * с новой строкой браузера — то есть с обновлением WebView или системы.
 */
const DRIVER_DEVICES_LIMIT = 50;

const toDriverDevice = (row: PersonDeviceRow): DriverDevice => ({
  deviceId: row.id,
  platform: row.platform,
  osVersion: row.osVersion,
  engineVersion: row.engineVersion,
  botApiVersion: row.botApiVersion,
  engineOk: row.engineOk,
  userAgent: row.userAgent,
  firstSeenAt: row.firstSeenAt.toISOString(),
  lastSeenAt: row.lastSeenAt.toISOString(),
  visits: row.visits,
});

export const readDriverDevices = async (personId: string): Promise<DriverDevicesResponse> => {
  const rows = await listPersonDevices(personId, DRIVER_DEVICES_LIMIT);

  return { devices: rows.map(toDriverDevice) };
};
