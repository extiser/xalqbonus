import { consola } from 'consola';
import type { Bot, Context } from 'grammy';

import { openAppKeyboard } from '#server/adapters/telegram/outgoing';
import { launchButton } from '#server/bot/launchButton';
import { sendScreen } from '#server/bot/screen';
import { text, type TextKey } from '#server/bot/texts';
import {
  bindEmployeeTelegram,
  type BindEmployeeTelegramOutcome,
} from '#server/services/employees/bindEmployeeTelegram';
import { readTelegramBindToken } from '#server/services/employees/employeeLinks';
import { preferredLanguage } from '#server/utils/language';

/**
 * Привязка Telegram к учётке сотрудника в боте (issue #267): `/start emp_<токен>` — сразу,
 * без контакта. Личность — `from.id` апдейта: Telegram его подписывает, и руками он не вводится
 * нигде. Ссылку сотрудник выпускает себе сам в вебе, на `/password`.
 *
 * Регистрируется перед приветствием и уступает ему всё, что не про привязку (`next()`):
 * `/start` без параметра, `inv_…` прежних приглашений, любое другое сообщение.
 *
 * Правила целиком в сервисе: обработчик разбирает апдейт, зовёт `bindEmployeeTelegram` и рисует
 * ответ (docs/principles.md → «Слои и зависимости»).
 *
 * Язык — из настроек Telegram: сотрудник приходит по ссылке, которую выпустил себе сам,
 * и экран выбора здесь был бы шагом ради симметрии с водителем.
 */

const log = consola.withTag('bot:employee-telegram');

/**
 * Текст на каждый исход. Полнота таблицы — защита: новый исход сервиса сломает сборку здесь
 * и заставит написать текст.
 */
export const EMPLOYEE_TELEGRAM_TEXT_KEYS: Readonly<Record<BindEmployeeTelegramOutcome, TextKey>> = {
  bound: 'employee_telegram_bound',
  not_found: 'employee_telegram_not_found',
  expired: 'employee_telegram_expired',
  used: 'employee_telegram_used',
  revoked: 'employee_telegram_revoked',
  telegram_demo: 'employee_telegram_demo',
  telegram_driver: 'employee_telegram_driver',
  telegram_employee: 'employee_telegram_employee',
  already_bound: 'employee_telegram_already_bound',
};

const chatIdOf = (context: Context): bigint | null =>
  context.chat === undefined ? null : BigInt(context.chat.id);

export const registerEmployeeTelegramHandlers = (bot: Bot): void => {
  bot.command('start', async (context, next) => {
    const chatId = chatIdOf(context);
    const token = readTelegramBindToken(context.match ?? '');

    // Не привязка сотрудника — апдейт уходит дальше нетронутым.
    if (chatId === null || token === null || context.from === undefined) {
      await next();

      return;
    }

    const language = preferredLanguage(context.from.language_code);
    const outcome = await bindEmployeeTelegram({ token, telegramUserId: BigInt(context.from.id) });

    log.info('открыта ссылка привязки Telegram', { chatId: chatId.toString(), outcome });

    // Кнопка запуска — только привязавшему: остальным открывать в приложении нечего.
    const button = outcome === 'bound' ? launchButton(language) : undefined;

    await sendScreen(context, chatId, text(EMPLOYEE_TELEGRAM_TEXT_KEYS[outcome], language), {
      reply_markup: openAppKeyboard(button),
    });
  });
};
