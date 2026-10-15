import type { TelegramWebApp } from '~/composables/useTelegramWebApp';

/** Версия Bot API, с которой есть окна номера и «Разрешить боту писать». */
const CONTACT_WINDOWS_VERSION = '6.9';

/**
 * Есть ли у Telegram окно номера: `requestContact` и `requestWriteAccess` появились в Bot API 6.9.
 * Нечем сравнить версию — окна нет: сравнение появилось ещё раньше.
 *
 * Одна проверка на экран заявки и на запрос состояния: без окна номера сервер не отдаёт лендинг,
 * а экран по умолчанию просит номер руками (issue #484).
 */
export const hasContactWindow = (webApp: TelegramWebApp | null): boolean =>
  (webApp?.isVersionAtLeast?.(CONTACT_WINDOWS_VERSION) ?? false) && Boolean(webApp?.requestContact);
