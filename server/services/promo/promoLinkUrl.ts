import { getBotUsername } from '#server/adapters/telegram/botIdentity';
import { readBotToken } from '#server/bot/config';
import { BotUnavailableError } from '#server/services/employees/botUnavailableError';
import { buildPromoLink } from '#server/services/employees/employeeLinks';

/**
 * Ссылка метки в бота — `https://t.me/<бот>?start=<код>` (issue #380). Имя бота — тем же путём,
 * что у ссылки привязки сотрудника: у Telegram по токену, а не переменной окружения.
 *
 * Бота нет — `BotUnavailableError`: ссылку и QR вести некуда, а напечатанная ссылка
 * в другого бота хуже отказа.
 */
export const readPromoLinkUrl = async (code: string): Promise<string> => {
  const botToken = readBotToken();

  if (botToken === '') {
    throw new BotUnavailableError();
  }

  return buildPromoLink(await getBotUsername(botToken), code);
};
