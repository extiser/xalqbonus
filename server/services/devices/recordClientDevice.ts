import type { ClientPlatform } from '#server/generated/prisma/enums';
import { recordClientDeviceVisit } from '#server/repositories/clientDevices';
import { listActiveOffices, type OfficeRow } from '#server/repositories/offices';
import { formatPhone } from '#shared/phone';
import type { MiniAppDeviceResponse, OldEngineOffice } from '#shared/types/miniapp';

/**
 * Вход в Mini App с телефона (issue #223): строка лога устройств и, если движок старый,
 * офисы для экрана «обновите».
 *
 * Пишет скрипт проверки движка, а не основной код: на старом движке основной код
 * не выполняется вовсе, и узнать о таком входе иначе нельзя.
 */

export type ClientDeviceInput = {
  telegramUserId: bigint;
  /** Заголовок `User-Agent` целиком. */
  userAgent: string;
  /** Что сказал клиент — `Telegram.WebApp.platform`. */
  platform: string;
  botApiVersion: string;
  engineOk: boolean;
};

/** Словарь Telegram шире нашего: вопрос к логу один — телефон это или нет. */
const toClientPlatform = (platform: string): ClientPlatform => {
  switch (platform) {
    case 'android':
      return 'android';
    case 'ios':
      return 'ios';
    case 'tdesktop':
    case 'macos':
      return 'desktop';
    default:
      return 'other';
  }
};

const ANDROID = /Android/;
const APPLE_MOBILE = /iPhone|iPad|iPod/;
const ANDROID_VERSION = /Android (\d+(?:\.\d+)*)/;
const IOS_VERSION = /OS (\d+)_(\d+)/;
const CHROME_VERSION = /Chrome\/(\d+)/;
const SAFARI_VERSION = /Version\/(\d+)/;

type ParsedUserAgent = {
  osVersion: string | null;
  engineVersion: number | null;
};

/**
 * Версии ОС и движка из строки браузера. Не разобралось — `null`, запись всё равно пишется:
 * строка браузера лежит рядом целиком, и разобрать её можно глазами.
 *
 * Устройство определяется самой строкой, а не присланной платформой: версии разбираются
 * из неё же, и разойтись с ней они не могут.
 */
export const parseUserAgent = (userAgent: string): ParsedUserAgent => {
  if (ANDROID.test(userAgent)) {
    const chrome = CHROME_VERSION.exec(userAgent);

    return {
      osVersion: ANDROID_VERSION.exec(userAgent)?.[1] ?? null,
      engineVersion: chrome ? Number(chrome[1]) : null,
    };
  }

  if (APPLE_MOBILE.test(userAgent)) {
    const ios = IOS_VERSION.exec(userAgent);
    const safari = SAFARI_VERSION.exec(userAgent);

    return {
      osVersion: ios ? `${ios[1]}.${ios[2]}` : null,
      engineVersion: safari ? Number(safari[1]) : null,
    };
  }

  return { osVersion: null, engineVersion: null };
};

const toOldEngineOffice = (row: OfficeRow): OldEngineOffice => ({
  name: row.name,
  address: row.address,
  workHours: row.workHours,
  phoneE164: row.phoneE164,
  phoneDisplay: row.phoneE164 === null ? null : formatPhone(row.phoneE164).display,
  mapUrl: row.mapUrl,
});

export const recordClientDevice = async (input: ClientDeviceInput): Promise<MiniAppDeviceResponse> => {
  const { osVersion, engineVersion } = parseUserAgent(input.userAgent);

  await recordClientDeviceVisit({
    telegramUserId: input.telegramUserId,
    userAgent: input.userAgent,
    platform: toClientPlatform(input.platform),
    osVersion,
    engineVersion,
    botApiVersion: input.botApiVersion === '' ? null : input.botApiVersion,
    engineOk: input.engineOk,
  });

  if (input.engineOk) {
    return { offices: [] };
  }

  const rows = await listActiveOffices();

  return { offices: rows.map(toOldEngineOffice) };
};
