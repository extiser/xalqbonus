import { createError, type H3Event } from 'h3';

import { readLinkedDriver, type LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { requireTelegramUser } from '#server/utils/telegramAuth';

/**
 * Участник программы, открывший приложение, — или отказ.
 *
 * Идентификатора человека в запросе нет и быть не может: чей это счёт и чьи заказы, решает
 * проверенная `initData` и привязка в базе (docs/miniapp.md → «Личность приходит
 * от мессенджера»). Поиск — по `telegram_chat_id`, как в `me.get.ts`.
 *
 * Отказ не участнику — строкой, а не кодом словаря: это отказ доменного правила
 * «в программе не состоит», а не двери (docs/decisions.md → «Граница словаря — дверь»).
 * Экран регистрации ручки участника не зовёт вовсе.
 */
export const requireMember = async (event: H3Event): Promise<LinkedDriver> => {
  const user = requireTelegramUser(event);
  const driver = await readLinkedDriver(user.id);

  if (!driver) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'в программе не состоит',
    });
  }

  return driver;
};
