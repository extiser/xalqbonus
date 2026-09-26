import { consola } from 'consola';
import { sendTelegramMessage, TelegramSendError } from '#server/adapters/telegram/outgoing';
import { readBotToken } from '#server/bot/config';
import { launchButton } from '#server/bot/launchButton';
import { text } from '#server/bot/texts';
import { findEmployeeByTelegramUserId } from '#server/repositories/employees';

/**
 * «Сбросить сессию» в профиле сотрудника (issue #250): бот присылает в чат приветствие
 * сотрудника с кнопкой «Открыть приложение» — то же, что на /start (`server/bot/greeting.ts`).
 *
 * `false` — этот Telegram сотруднику не принадлежит или учётка выключена: решать, кто он,
 * дальше будет ручка. `true` — сотрудник, и попытка отправки сделана при любом её исходе:
 * приложение закрывается всё равно, а человек нажмёт /start сам.
 *
 * Напрямую, без очереди уведомлений: очередь адресуется человеком программы (`personId`),
 * а у сотрудника его нет — таблицы разведены (docs/decisions.md → «Учётка сотрудника и роли»).
 * Чат — тот же Telegram, что пришёл в `initData`: в личной переписке это одно число.
 *
 * Приветствие по-русски: служебная часть одноязычна (docs/frontend.md → «Язык»).
 */

const log = consola.withTag('employees:relaunch');

export const requestEmployeeAppRelaunch = async (telegramUserId: bigint): Promise<boolean> => {
  const employee = await findEmployeeByTelegramUserId(telegramUserId);

  if (!employee || employee.disabledAt !== null) {
    return false;
  }

  const token = readBotToken();

  // Пустой токен — как в `sendNotification`: отправлять нечем, и на боевой машине это авария.
  if (token === '') {
    log.error('приветствие после сброса сессии потеряно: TG_BOT_TOKEN пуст, отправлять нечем', {
      employeeId: employee.id,
    });

    return true;
  }

  try {
    await sendTelegramMessage({
      token,
      telegramChatId: telegramUserId,
      text: text('employee_greeting', 'ru'),
      openAppButton: launchButton('ru'),
    });
  } catch (error) {
    log.warn('приветствие после сброса сессии не ушло', {
      employeeId: employee.id,
      kind: error instanceof TelegramSendError ? error.kind : 'unknown',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return true;
};
