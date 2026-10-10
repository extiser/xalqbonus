import { getBotUsername } from '#server/adapters/telegram/botIdentity';
import { readBotToken } from '#server/bot/config';
import type { PromoMedium } from '#server/generated/prisma/enums';
import { BotUnavailableError } from '#server/services/employees/botUnavailableError';
import { buildPromoAppLink, buildPromoBotLink, buildPromoLink } from '#server/services/employees/employeeLinks';

/**
 * Имя бота — тем же путём, что у ссылки привязки сотрудника: у Telegram по токену, а не переменной
 * окружения.
 *
 * Бота нет — `BotUnavailableError`: ссылку и QR вести некуда, а напечатанная ссылка
 * в другого бота хуже отказа.
 */
const readBotUsername = async (): Promise<string> => {
  const botToken = readBotToken();

  if (botToken === '') {
    throw new BotUnavailableError();
  }

  return getBotUsername(botToken);
};

/**
 * Ссылка метки (issue #380): в чат бота `?start=<код>` или, у рекламы в Telegram, в Mini App
 * `?startapp=<код>` (issue #456) — по носителю метки.
 */
export const readPromoLinkUrl = async (code: string, medium: PromoMedium): Promise<string> =>
  buildPromoLink(await readBotUsername(), code, medium);

/**
 * Обе ссылки кода сразу — окну «Новая метка»: носитель там ещё не выбран, и поле «Ссылка»
 * меняется с выбором без нового запроса.
 */
export const readPromoLinkUrls = async (code: string): Promise<{ link: string; appLink: string }> => {
  const botUsername = await readBotUsername();

  return {
    link: buildPromoBotLink(botUsername, code),
    appLink: buildPromoAppLink(botUsername, code),
  };
};
